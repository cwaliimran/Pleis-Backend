const { UnrecoverableError } = require("bullmq");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
const { UserBillingInformation } = require("../transactions/UserBillingInformation");
const Organizations = require("@OrganizationModel");
const BillkoInvoice = require("./BillkoInvoice.model");
const {
  createInvoice,
  findInvoicesByOrderNumber,
  isInvalidApiKeyError,
} = require("../paymentsIntegrations/billko/billkoClient");
const {
  getPleisBillkoApiKey,
  getOrganizerSeller,
  formatOrganizerAddress,
} = require("../paymentsIntegrations/billko/billkoCredentials");
const {
  toGross,
  mapGatewayPaymentType,
  buildBillingInformation,
  buildCreateInvoicePayload,
  buildServiceFeeProducts,
  buildTicketProducts,
  buildServiceProducts,
  scaleLinesToGross,
  buildOrganizerAttributionNote,
} = require("../paymentsIntegrations/billko/billkoInvoiceBuilder");
const {
  requireLabelFromPercent,
  displayPercent,
  TIP_TAX_LABEL,
  VOUCHER_TAX_LABEL,
} = require("../paymentsIntegrations/billko/taxRateLabels");
const {
  issuePaymentConfirmation,
  mapOrderItems,
  generateVoucherCode,
  resolveLocale,
} = require("./confirmationGenerator");
const { getCopy } = require("./confirmationI18n");

function failUnrecoverable(error) {
  if (
    isInvalidApiKeyError(error) ||
    error?.code === "E01001" ||
    error?.message === "billko_unknown_tax_rate" ||
    error?.message === "billko_unknown_tax_rate_label" ||
    error?.message === "billko_organizer_missing" ||
    error?.message === "billko_account_required"
  ) {
    const unrecoverable = new UnrecoverableError(error.message);
    unrecoverable.code = error.code;
    unrecoverable.statusCode = error.statusCode;
    unrecoverable.billkoHttpStatus = error.billkoHttpStatus;
    unrecoverable.billkoResponse = error.billkoResponse;
    unrecoverable.billkoError = error.billkoError;
    throw unrecoverable;
  }
  throw error;
}

function persistInvoiceFields(result) {
  const fiscalized = Boolean(result?.fiscalizationNumber);
  return {
    billkoId: result?.id || result?._id || "",
    invoiceNumber: result?.invoiceNumber || "",
    fiscalizationNumber: result?.fiscalizationNumber || "",
    invoicePreviewLink: result?.invoicePreviewLink || "",
    pdfFileName: result?.fileName || "",
    status: fiscalized ? "fiscalized" : "fiscalization_failed",
    rawResponse: result,
    lastError: fiscalized ? "" : "invoice_created_but_not_fiscalized",
  };
}

async function ensureInvoice({
  kind,
  seller,
  apiKey,
  payload,
  orderType,
  orderId,
  orderNumber,
  organization,
  companyOrganizer,
  user,
  uniqueCodePrefix,
}) {
  const existing = await BillkoInvoice.findOne({ orderNumber, kind });
  if (existing?.billkoId) return existing;

  let remote = [];
  try {
    remote = await findInvoicesByOrderNumber(apiKey, orderNumber);
  } catch (error) {
    failUnrecoverable(error);
  }
  const prefixes = [].concat(uniqueCodePrefix || []).filter(Boolean);
  const matched = (remote || []).find((invoice) => {
    const products = invoice.products || invoice.result?.products || [];
    return products.some((product) => {
      const code = String(product.uniqueCode || "");
      if (!prefixes.length) return Boolean(code);
      return prefixes.some((prefix) => code.startsWith(prefix));
    });
  });

  if (matched) {
    return BillkoInvoice.findOneAndUpdate(
      { orderNumber, kind },
      {
        $set: {
          kind,
          seller,
          orderType,
          orderId,
          orderNumber,
          organization,
          companyOrganizer,
          user,
          amount: payload.payment?.[0]?.amount || 0,
          taxRateLabels: (payload.products || []).map((p) => p.taxRateLabels?.[0]).filter(Boolean),
          ...persistInvoiceFields(matched),
        },
      },
      { upsert: true, new: true },
    );
  }

  let result;
  try {
    result = await createInvoice(apiKey, payload);
  } catch (error) {
    failUnrecoverable(error);
  }

  return BillkoInvoice.findOneAndUpdate(
    { orderNumber, kind },
    {
      $set: {
        kind,
        seller,
        orderType,
        orderId,
        orderNumber,
        organization,
        companyOrganizer,
        user,
        amount: payload.payment?.[0]?.amount || 0,
        taxRateLabels: (payload.products || []).map((p) => p.taxRateLabels?.[0]).filter(Boolean),
        ...persistInvoiceFields(result),
      },
    },
    { upsert: true, new: true },
  );
}

function groupTicketLines(bookings) {
  const grouped = new Map();
  for (const booking of bookings) {
    const snapshot = booking.ticket?.snapshot || {};
    const ticketId = String(booking.ticket?.ticketId || snapshot._id || "");
    const uniqueCode = `TCK-${ticketId}`;
    const taxRateLabel = requireLabelFromPercent(
      snapshot.taxPercentage ?? snapshot.taxPercent ?? snapshot.tax,
      snapshot.title,
    );
    const unitRetailPrice = Number(
      snapshot.resolvedPrice ?? snapshot.price ?? 0,
    );
    const current = grouped.get(uniqueCode) || {
      uniqueCode,
      ticketId,
      name: snapshot.title || "Ulaznica",
      taxRateLabel,
      unitRetailPrice,
      quantity: 0,
    };
    current.quantity += 1;
    grouped.set(uniqueCode, current);
  }
  return [...grouped.values()];
}

async function issueTicketingInvoices(orderId) {
  const order = await TicketingOrders.findById(orderId)
    .populate("userBillingInformation")
    .lean();
  if (!order) throw new Error("ticketing_order_not_found");
  if (order.paymentDetails?.paymentStatus !== "paid") return null;

  const bookings = await TicketingBookings.find({ order: order._id }).lean();
  if (!bookings.length) throw new Error("ticketing_bookings_not_found");

  const [organization, billing] = await Promise.all([
    Organizations.findById(order.organization).select("basicInfo location").lean(),
    order.userBillingInformation
      ? Promise.resolve(order.userBillingInformation)
      : UserBillingInformation.findOne({ user: order.user, status: "active" }).lean(),
  ]);

  const seller = await getOrganizerSeller(order.companyOrganizer, organization);
  const ticketLines = groupTicketLines(bookings);
  const paymentType = mapGatewayPaymentType(order.paymentDetails?.paymentMethod);
  const billingInformation = buildBillingInformation(billing);
  const orderNumber = String(order._id);
  const feeTotal = toGross(order.orderPricing?.taxAmount || 0);

  const invoices = [];

  if (feeTotal > 0) {
    const feeProducts = buildServiceFeeProducts(ticketLines, feeTotal);
    const feePayload = buildCreateInvoicePayload({
      orderNumber,
      products: feeProducts,
      paymentType,
      billingInformation,
    });
    invoices.push(
      await ensureInvoice({
        kind: "service_fee",
        seller: "pleis",
        apiKey: getPleisBillkoApiKey(),
        payload: feePayload,
        orderType: "ticketingbookings",
        orderId: order._id,
        orderNumber,
        organization: order.organization,
        companyOrganizer: order.companyOrganizer,
        user: order.user,
        uniqueCodePrefix: "FEE-",
      }),
    );
  }

  const ticketProducts = buildTicketProducts(
    ticketLines,
    buildOrganizerAttributionNote(seller),
  );
  const ticketPayload = buildCreateInvoicePayload({
    orderNumber,
    products: ticketProducts,
    paymentType,
    billingInformation,
  });
  invoices.push(
    await ensureInvoice({
      kind: "tickets",
      seller: "organizer",
      apiKey: seller.apiKey,
      payload: ticketPayload,
      orderType: "ticketingbookings",
      orderId: order._id,
      orderNumber,
      organization: order.organization,
      companyOrganizer: order.companyOrganizer,
      user: order.user,
      uniqueCodePrefix: "TCK-",
    }),
  );

  return invoices;
}

function lineTaxLabel(snapshot, context) {
  return (
    snapshot?.taxRateLabel ||
    requireLabelFromPercent(
      snapshot?.taxPercent ?? snapshot?.taxPercentage ?? snapshot?.tax ?? 0,
      context,
    )
  );
}

function buildMenuOrderLines(order) {
  const lines = [];
  for (const item of order.items || []) {
    if (!item.quantity) continue;
    const snapshot = item.menuItemSnapShot || {};
    const unit = Number(item.unitFinalPrice ?? item.unitPrice ?? 0);
    if (unit <= 0) continue;
    lines.push({
      uniqueCode: `MNU-${item.menuItem || snapshot._id || lines.length}`,
      name: snapshot.title || "Menu item",
      quantity: item.quantity,
      unitRetailPrice: unit,
      taxRateLabel: lineTaxLabel(snapshot, snapshot.title),
    });
  }
  for (const combo of order.combos || []) {
    if (!combo.quantity) continue;
    const snapshot = combo.comboSnapShot || {};
    const unit = Number(combo.unitFinalPrice ?? combo.unitPrice ?? 0);
    if (unit <= 0) continue;
    const firstItem = combo.items?.[0]?.menuItemSnapShot || {};
    lines.push({
      uniqueCode: `CMB-${combo.combo || snapshot._id || lines.length}`,
      name: snapshot.name || snapshot.title || "Combo",
      quantity: combo.quantity,
      unitRetailPrice: unit,
      taxRateLabel: lineTaxLabel(
        { ...firstItem, taxPercent: snapshot.taxPercent ?? firstItem.taxPercent },
        snapshot.name,
      ),
    });
  }
  const tip = Number(order.priceBreakdown?.tip || 0);
  if (tip > 0) {
    lines.push({
      uniqueCode: `TIP-${order._id}`,
      name: "Tip",
      quantity: 1,
      unitRetailPrice: tip,
      taxRateLabel: TIP_TAX_LABEL,
    });
  }
  return lines;
}

async function issueOrderingInvoices(order) {
  const organization = order.organization;
  const companyOrganizer = organization?.creator || order.companyOrganizer;
  const seller = await getOrganizerSeller(companyOrganizer, organization);
  const billing = await UserBillingInformation.findOne({
    user: order.user?._id || order.user,
    status: "active",
  }).lean();
  const paymentType = mapGatewayPaymentType(order.paymentMethod);
  const billingInformation = buildBillingInformation(billing, {
    firstName: order.user?.firstName,
    lastName: order.user?.lastName,
    email: order.user?.email,
  });
  const orderNumber = String(order._id);
  let lines = buildMenuOrderLines(order);
  const paidGross = toGross(
    (order.priceBreakdown?.finalTotal ?? order.totalPrice) || 0,
  );
  if (paidGross > 0 && lines.length) {
    lines = scaleLinesToGross(lines, paidGross);
  }

  const invoices = [];
  const feeTotal = toGross(order.priceBreakdown?.tax || 0);
  if (feeTotal > 0 && lines.length) {
    invoices.push(
      await ensureInvoice({
        kind: "service_fee",
        seller: "pleis",
        apiKey: getPleisBillkoApiKey(),
        payload: buildCreateInvoicePayload({
          orderNumber,
          products: buildServiceFeeProducts(lines, feeTotal),
          paymentType,
          billingInformation,
        }),
        orderType: "menuorders",
        orderId: order._id,
        orderNumber,
        organization: organization?._id || order.organization,
        companyOrganizer,
        user: order.user?._id || order.user,
        uniqueCodePrefix: "FEE-",
      }),
    );
  }

  if (lines.length) {
    invoices.push(
      await ensureInvoice({
        kind: "menu_items",
        seller: "organizer",
        apiKey: seller.apiKey,
        payload: buildCreateInvoicePayload({
          orderNumber,
          products: buildServiceProducts(
            lines,
            buildOrganizerAttributionNote(seller),
          ),
          paymentType,
          billingInformation,
        }),
        orderType: "menuorders",
        orderId: order._id,
        orderNumber,
        organization: organization?._id || order.organization,
        companyOrganizer,
        user: order.user?._id || order.user,
        uniqueCodePrefix: ["MNU-", "CMB-", "TIP-"],
      }),
    );
  }

  return invoices;
}

async function issueOrderingConfirmation(menuOrderId) {
  const order = await MenuOrders.findById(menuOrderId)
    .populate("organization", "basicInfo location creator")
    .populate("user", "firstName lastName email language")
    .lean();
  if (!order) throw new Error("menu_order_not_found");
  if (order.paymentStatus !== "paid") return null;

  const invoices = await issueOrderingInvoices(order);

  const organization = order.organization;
  const seller = await getOrganizerSeller(organization?.creator || order.companyOrganizer, organization).catch(
    () => ({
      companyName: organization?.basicInfo?.name || "",
      oib: "",
      address: "",
      venueName: organization?.basicInfo?.name || "",
    }),
  );

  const billing = await UserBillingInformation.findOne({
    user: order.user?._id || order.user,
    status: "active",
  }).lean();

  const customerName =
    [billing?.firstName, billing?.lastName].filter(Boolean).join(" ") ||
    [order.user?.firstName, order.user?.lastName].filter(Boolean).join(" ") ||
    "Guest";
  const customerEmail = billing?.email || order.user?.email;
  if (!customerEmail) throw new Error("confirmation_email_missing");

  const locale = resolveLocale(order.user?.language);

  const confirmation = await issuePaymentConfirmation({
    module: "ORDERING",
    orderId: order._id,
    orderReference: order.orderNumber || String(order._id),
    transactionId: order.transactionId || String(order._id),
    organizerCompanyId: organization?.creator || order.user?._id,
    organization: organization?._id || order.organization,
    customerName,
    customerEmail,
    paidAt: order.paidAt || new Date(),
    paymentMethod: order.paymentMethod,
    amount: order.priceBreakdown?.finalTotal ?? order.totalPrice,
    currency: "EUR",
    items: mapOrderItems(order, locale),
    organizerLegalName: seller.companyName,
    organizerVenueName: seller.venueName || organization?.basicInfo?.name,
    organizerAddress: seller.address || formatOrganizerAddress(organization?.location),
    organizerOib: seller.oib,
    locale,
  });
  return { invoices, confirmation };
}

async function issueReservationInvoices(reservation, organization) {
  const seller = await getOrganizerSeller(
    reservation.companyOrganizer,
    organization,
  );
  const billing = reservation.userBillingInformation;
  const paymentType = mapGatewayPaymentType(
    reservation.paymentDetails?.paymentMethod,
  );
  const billingInformation = buildBillingInformation(billing, {
    firstName: reservation.firstName || reservation.userId?.firstName,
    lastName: reservation.lastName || reservation.userId?.lastName,
    email: reservation.email || reservation.userId?.email,
  });
  const orderNumber = String(reservation._id);
  const snapshot = reservation.reservationSnapshot || {};
  const reservationDoc = reservation.reservationId || {};
  const name =
    snapshot.name || reservationDoc.reservationType?.name || "Reservation";
  const isMinSpend =
    reservationDoc.conditionType === "minimumSpendOnLocation" ||
    snapshot.conditionType === "minimumSpendOnLocation";
  const amount = toGross(reservation.amount || 0);
  if (amount <= 0) return [];

  const line = {
    uniqueCode: `RES-${reservation._id}`,
    name: isMinSpend ? `${name} (prepayment)` : name,
    quantity: 1,
    unitRetailPrice: amount,
    taxRateLabel: isMinSpend
      ? VOUCHER_TAX_LABEL
      : lineTaxLabel(
          snapshot.taxRateLabel
            ? snapshot
            : {
                taxPercent:
                  snapshot.taxPercentage ??
                  snapshot.taxPercent ??
                  reservationDoc.taxPercentage ??
                  reservationDoc.tax ??
                  0,
              },
          name,
        ),
  };

  return [
    await ensureInvoice({
      kind: "reservation",
      seller: "organizer",
      apiKey: seller.apiKey,
      payload: buildCreateInvoicePayload({
        orderNumber,
        products: buildServiceProducts(
          [line],
          buildOrganizerAttributionNote(seller),
        ),
        paymentType,
        billingInformation,
      }),
      orderType: "userreservations",
      orderId: reservation._id,
      orderNumber,
      organization: organization?._id,
      companyOrganizer: reservation.companyOrganizer,
      user: reservation.userId?._id || reservation.userId,
      uniqueCodePrefix: "RES-",
    }),
  ];
}

async function issueReservationConfirmation(reservationId) {
  const reservation = await UserReservations.findById(reservationId)
    .populate("organizationId", "basicInfo location creator")
    .populate("userBillingInformation")
    .populate("userId", "firstName lastName email language")
    .populate("reservationId")
    .lean();
  if (!reservation) throw new Error("reservation_not_found");
  if (reservation.paymentDetails?.paymentStatus !== "paid") return null;
  if (!reservation.amount || reservation.amount <= 0) return null;

  const organization = reservation.organizationId;
  const invoices = await issueReservationInvoices(reservation, organization);

  const seller = await getOrganizerSeller(
    reservation.companyOrganizer,
    organization,
  ).catch(() => ({
    companyName: organization?.basicInfo?.name || "",
    oib: "",
    address: "",
    venueName: organization?.basicInfo?.name || "",
  }));

  const billing = reservation.userBillingInformation;
  const customerName =
    [billing?.firstName, billing?.lastName].filter(Boolean).join(" ") ||
    [reservation.firstName, reservation.lastName].filter(Boolean).join(" ") ||
    [reservation.userId?.firstName, reservation.userId?.lastName].filter(Boolean).join(" ") ||
    "Guest";
  const customerEmail =
    billing?.email || reservation.email || reservation.userId?.email;
  if (!customerEmail) throw new Error("confirmation_email_missing");

  const snapshot = reservation.reservationSnapshot || {};
  const reservationDoc = reservation.reservationId || {};
  const locale = resolveLocale(reservation.userId?.language);
  const copy = getCopy(locale);
  const isMinSpend =
    reservationDoc.conditionType === "minimumSpendOnLocation" ||
    snapshot.conditionType === "minimumSpendOnLocation";

  const reservationName =
    snapshot.name || reservationDoc.reservationType?.name || copy.reservation;
  const items = [];
  let voucher;

  if (isMinSpend) {
    const slot = reservation.timingSlots?.dateTimeSlots?.[0];
    const validFrom = slot?.date || reservation.paidAt || new Date();
    const lastSlot = reservation.timingSlots?.dateTimeSlots?.slice(-1)?.[0];
    const validTo =
      lastSlot?.timeSlots?.slice(-1)?.[0]?.endTime ||
      lastSlot?.date ||
      validFrom;
    voucher = {
      code: reservation.voucher?.code?.startsWith("PLS-")
        ? reservation.voucher.code
        : generateVoucherCode(),
      amount: reservation.voucher?.discountAmount || reservation.amount,
      validFrom,
      validTo,
      venueName: organization?.basicInfo?.name || seller.venueName,
    };
    items.push({
      name: reservationName,
      vatPercent: displayPercent(
        snapshot.taxPercentage ?? snapshot.taxPercent ?? reservationDoc.taxPercentage ?? reservationDoc.tax,
      ),
      quantity: 1,
      unitPrice: 0,
      amount: 0,
      isOption: true,
    });
    items.push({
      name: copy.minSpendPrepayment,
      vatPercent: 0,
      quantity: 1,
      unitPrice: voucher.amount,
      amount: voucher.amount,
    });
    if (voucher.code && reservation.voucher?.code !== voucher.code) {
      await UserReservations.updateOne(
        { _id: reservation._id },
        { $set: { "voucher.code": voucher.code } },
      );
    }
  } else {
    items.push({
      name: reservationName,
      vatPercent: displayPercent(
        snapshot.taxPercentage ?? snapshot.taxPercent ?? reservationDoc.taxPercentage ?? reservationDoc.tax,
      ),
      quantity: 1,
      unitPrice: reservation.amount,
      amount: reservation.amount,
    });
  }

  const confirmation = await issuePaymentConfirmation({
    module: "RESERVATION",
    orderId: reservation._id,
    orderReference: reservation.bookingId || String(reservation._id),
    transactionId:
      reservation.paymentDetails?.transactionId || String(reservation._id),
    organizerCompanyId: reservation.companyOrganizer,
    organization: organization?._id,
    customerName,
    customerEmail,
    paidAt: reservation.paidAt || new Date(),
    paymentMethod: reservation.paymentDetails?.paymentMethod,
    amount: reservation.amount,
    currency: "EUR",
    items,
    voucher,
    organizerLegalName: seller.companyName,
    organizerVenueName: seller.venueName || organization?.basicInfo?.name,
    organizerAddress: seller.address,
    organizerOib: seller.oib,
    locale,
  });
  return { invoices, confirmation };
}

async function handleSuccessfulPayment(job) {
  const { kind, orderId } = job || {};
  if (!kind || !orderId) {
    throw new UnrecoverableError("fiscal_document_job_invalid");
  }

  if (kind === "ticketing_invoices") {
    return issueTicketingInvoices(orderId);
  }
  if (kind === "ordering_confirmation") {
    return issueOrderingConfirmation(orderId);
  }
  if (kind === "reservation_confirmation") {
    return issueReservationConfirmation(orderId);
  }

  throw new UnrecoverableError(`unsupported_fiscal_document_kind:${kind}`);
}

// Deferred (not in this slice): subscription eRačun, refund/storno,
// Fiscalize/commission batches, admin document ZIP downloads, pain.001 payouts.

async function applyBillkoCallback(payload) {
  const result = payload?.result || payload;
  const billkoId = result?.id || payload?.id;
  const orderNumber = result?.orderNumber || payload?.orderNumber;
  if (!billkoId && !orderNumber) return null;

  const update = persistInvoiceFields(result);
  const query = billkoId ? { billkoId } : { orderNumber };
  return BillkoInvoice.findOneAndUpdate(query, { $set: update }, { new: true });
}

module.exports = {
  handleSuccessfulPayment,
  issueTicketingInvoices,
  issueOrderingConfirmation,
  issueReservationConfirmation,
  applyBillkoCallback,
};
