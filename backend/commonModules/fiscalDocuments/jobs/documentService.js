const { UnrecoverableError } = require("bullmq");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
const { UserBillingInformation } = require("../../transactions/UserBillingInformation");
const Organizations = require("@OrganizationModel");
const BillkoInvoice = require("../models/BillkoInvoice.model");
const {
  createInvoice,
  findInvoicesByOrderNumber,
  isInvalidApiKeyError,
  refundInvoice,
  isBillkoStornoEnabled,
} = require("../../paymentsIntegrations/billko/billkoClient");
const {
  stripPdfPayload,
  storeInvoicePdfIfAvailable,
  maybeEmailTicketingInvoicePdfs,
} = require("../invoice/pdf");
const {
  getPleisBillkoApiKey,
  getOrganizerSeller,
  getOrganizerParty,
  formatOrganizerAddress,
} = require("../../paymentsIntegrations/billko/billkoCredentials");
const {
  toGross,
  mapGatewayPaymentType,
  buildBillingInformation,
  buildCreateInvoicePayload,
  buildPartialRefundInvoicePayload,
  resolveReferentDocumentDT,
  isFullTicketRefund,
  buildServiceFeeProducts,
  buildTicketProducts,
  buildServiceProducts,
  scaleLinesToGross,
  buildOrganizerAttributionNote,
  InvoiceFormat,
} = require("../../paymentsIntegrations/billko/billkoInvoiceBuilder");
const {
  requireTaxRateLabel,
  displayPercent,
  TIP_TAX_LABEL,
  VOUCHER_TAX_LABEL,
} = require("../../paymentsIntegrations/billko/taxRateLabels");
const {
  issuePaymentConfirmation,
  mapOrderItems,
  mapTicketingItems,
  generateVoucherCode,
  resolveLocale,
  snapshotCardFromMonriPayload,
} = require("../confirmation/generator");
const { getCopy } = require("../locales");
const MonriTransaction = require("../../paymentsIntegrations/monri/MonriTransaction");
const {
  buildSubscriptionInvoicePayload,
} = require("../invoice/subscriptionBuilder");

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

function extractFiscalProtectionCode(result = {}) {
  return (
    result.fiscalProtectionCode ||
    result.zki ||
    result.ZKI ||
    result.protectionCode ||
    ""
  );
}

function persistInvoiceFields(result, payload = {}) {
  const fiscalized = Boolean(result?.fiscalizationNumber);
  const raw = { ...(result || {}) };
  if (payload.products) raw.products = payload.products;
  if (payload.billingInformation) raw.billingInformation = payload.billingInformation;
  if (payload.payment) raw.payment = payload.payment;
  if (payload.note) raw.note = payload.note;
  if (payload.orderNumber) raw.orderNumber = payload.orderNumber;
  const fiscalProtectionCode = extractFiscalProtectionCode(result);
  return {
    billkoId: result?.id || result?._id || "",
    invoiceNumber: result?.invoiceNumber || "",
    fiscalizationNumber: result?.fiscalizationNumber || "",
    fiscalProtectionCode,
    invoicePreviewLink: result?.invoicePreviewLink || "",
    pdfFileName: result?.fileName || "",
    status: fiscalized ? "fiscalized" : "fiscalization_failed",
    rawResponse: stripPdfPayload(raw),
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
  if (existing?.billkoId) {
    if (!existing.rawResponse?.products?.length && payload?.products?.length) {
      existing.rawResponse = {
        ...(existing.rawResponse || {}),
        products: payload.products,
        billingInformation: payload.billingInformation,
        payment: payload.payment,
        note: payload.note,
        orderNumber: payload.orderNumber,
      };
      await BillkoInvoice.updateOne(
        { _id: existing._id },
        { $set: { rawResponse: existing.rawResponse } },
      );
    }
    await storeInvoicePdfIfAvailable(existing);
    return existing;
  }

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
    const existingMatched = await BillkoInvoice.findOneAndUpdate(
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
          ...persistInvoiceFields(matched, payload),
        },
      },
      { upsert: true, new: true },
    );
    await storeInvoicePdfIfAvailable(existingMatched);
    return existingMatched;
  }

  let result;
  try {
    result = await createInvoice(apiKey, payload);
  } catch (error) {
    failUnrecoverable(error);
  }

  const created = await BillkoInvoice.findOneAndUpdate(
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
        ...persistInvoiceFields(result, payload),
      },
    },
    { upsert: true, new: true },
  );
  await storeInvoicePdfIfAvailable(created);
  return created;
}

function groupTicketLines(bookings) {
  const grouped = new Map();
  for (const booking of bookings) {
    const snapshot = booking.ticket?.snapshot || {};
    const ticketId = String(booking.ticket?.ticketId || snapshot._id || "");
    const uniqueCode = `TCK-${ticketId}`;
    const taxRateLabel = requireTaxRateLabel(snapshot, snapshot.title);
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

async function profileNameForUser(userRef) {
  if (userRef && typeof userRef === "object" && userRef.firstName) {
    return {
      firstName: userRef.firstName,
      lastName: userRef.lastName,
      email: userRef.email,
    };
  }
  const id = userRef && typeof userRef === "object" ? userRef._id : userRef;
  if (!id) return { firstName: "", lastName: "", email: "" };
  const { User } = require("../../../models/UserModel");
  const user = await User.findById(id).select("firstName lastName email").lean();
  return {
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
  };
}

async function issueTicketingInvoices(orderId) {
  const order = await TicketingOrders.findById(orderId)
    .populate("userBillingInformation")
    .populate("user", "firstName lastName email language")
    .lean();
  if (!order) throw new Error("ticketing_order_not_found");
  if (order.paymentDetails?.paymentStatus !== "paid") return null;

  const bookings = await TicketingBookings.find({ order: order._id }).lean();
  if (!bookings.length) throw new Error("ticketing_bookings_not_found");

  const userId = order.user?._id || order.user;
  const { Events } = require("../../events/Event");
  const [organization, billing, profile, event] = await Promise.all([
    Organizations.findById(order.organization).select("basicInfo location").lean(),
    order.userBillingInformation
      ? Promise.resolve(order.userBillingInformation)
      : UserBillingInformation.findOne({ user: userId, status: "active" }).lean(),
    profileNameForUser(order.user),
    order.event
      ? Events.findById(order.event)
          .select("publicId basicInfo.title basicInfo.venue schedule")
          .populate("basicInfo.venue", "title")
          .lean()
      : Promise.resolve(null),
  ]);

  const seller = await getOrganizerSeller(order.companyOrganizer, organization);
  const ticketLines = groupTicketLines(bookings);
  const paymentType = mapGatewayPaymentType(order.paymentDetails?.paymentMethod);
  const billingInformation = buildBillingInformation(
    {
      ...(billing || {}),
      email: billing?.email || profile.email,
    },
    {
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
    },
  );
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
        user: userId,
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
      user: userId,
      uniqueCodePrefix: "TCK-",
    }),
  );

  await maybeEmailTicketingInvoicePdfs(orderNumber, userId);

  const customerName =
    [billing?.firstName, billing?.lastName].filter(Boolean).join(" ") ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
    "Guest";
  const customerEmail = billing?.email || profile.email;
  if (!customerEmail) throw new Error("confirmation_email_missing");

  const locale = resolveLocale(order.user?.language);
  const card = await loadCardSnapshotForOrder(
    order._id,
    order.paymentDetails?.transactionId,
  );
  const confirmation = await issuePaymentConfirmation({
    module: "TICKETING",
    orderId: order._id,
    orderReference:
      event?.publicId || event?.basicInfo?.title || String(order._id),
    transactionId:
      order.paymentDetails?.transactionId || String(order._id),
    organizerCompanyId: order.companyOrganizer || userId,
    organization: order.organization,
    customerUserId: userId || null,
    customerName,
    customerEmail,
    paidAt: order.updatedAt || new Date(),
    paymentMethod: order.paymentDetails?.paymentMethod,
    cardLast4: card.cardLast4,
    cardBrand: card.cardBrand,
    amount:
      order.orderPricing?.total ??
      ticketLines.reduce(
        (sum, line) => sum + Number(line.unitRetailPrice || 0) * Number(line.quantity || 0),
        0,
      ) + feeTotal,
    currency: "EUR",
    items: mapTicketingItems({
      ticketLines,
      bookings,
      event,
      organization,
      serviceFee: feeTotal,
      locale,
    }),
    organizerLegalName: seller.companyName,
    organizerVenueName:
      event?.basicInfo?.venue?.title ||
      seller.venueName ||
      organization?.basicInfo?.name,
    organizerAddress: seller.address || formatOrganizerAddress(organization?.location),
    organizerOib: seller.oib,
    locale,
  });

  return { invoices, confirmation };
}

function lineTaxLabel(snapshot, context) {
  return requireTaxRateLabel(snapshot, context);
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

// Historical helper. Confirmation jobs must not call this (Billko §5).
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

async function loadCardSnapshotForOrder(orderId, transactionId) {
  const query = [];
  if (orderId) query.push({ orderNumber: String(orderId) });
  if (transactionId) query.push({ monriTransactionId: String(transactionId) });
  if (!query.length) return {};
  const tx = await MonriTransaction.findOne({ $or: query })
    .select("rawCallback paymentMethod")
    .lean();
  return snapshotCardFromMonriPayload(tx?.rawCallback);
}

async function issueOrderingConfirmation(menuOrderId) {
  const order = await MenuOrders.findById(menuOrderId)
    .populate("organization", "basicInfo location creator")
    .populate("user", "firstName lastName email language")
    .lean();
  if (!order) throw new Error("menu_order_not_found");
  if (order.paymentStatus !== "paid") return null;

  const organization = order.organization;
  const seller = await getOrganizerParty(
    organization?.creator || order.companyOrganizer,
    organization,
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
  const card = await loadCardSnapshotForOrder(
    order._id,
    order.transactionId,
  );

  const confirmation = await issuePaymentConfirmation({
    module: "ORDERING",
    orderId: order._id,
    orderReference: order.orderNumber || String(order._id),
    transactionId: order.transactionId || String(order._id),
    organizerCompanyId: organization?.creator || order.user?._id,
    organization: organization?._id || order.organization,
    customerUserId: order.user?._id || order.user || null,
    customerName,
    customerEmail,
    paidAt: order.paidAt || new Date(),
    paymentMethod: order.paymentMethod,
    cardLast4: card.cardLast4,
    cardBrand: card.cardBrand,
    amount: order.priceBreakdown?.finalTotal ?? order.totalPrice,
    currency: "EUR",
    items: mapOrderItems(order, locale),
    organizerLegalName: seller.companyName,
    organizerVenueName: seller.venueName || organization?.basicInfo?.name,
    organizerAddress: seller.address || formatOrganizerAddress(organization?.location),
    organizerOib: seller.oib,
    locale,
  });
  return { invoices: [], confirmation };
}

// Historical helper. Confirmation jobs must not call this (Billko §5).
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
  const seller = await getOrganizerParty(
    reservation.companyOrganizer,
    organization,
  );

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

  const card = await loadCardSnapshotForOrder(
    reservation._id,
    reservation.paymentDetails?.transactionId,
  );

  const confirmation = await issuePaymentConfirmation({
    module: "RESERVATION",
    orderId: reservation._id,
    orderReference: reservation.bookingId || String(reservation._id),
    transactionId:
      reservation.paymentDetails?.transactionId || String(reservation._id),
    organizerCompanyId: reservation.companyOrganizer,
    organization: organization?._id,
    customerUserId: reservation.userId?._id || reservation.userId || null,
    customerName,
    customerEmail,
    paidAt: reservation.paidAt || new Date(),
    paymentMethod: reservation.paymentDetails?.paymentMethod,
    cardLast4: card.cardLast4,
    cardBrand: card.cardBrand,
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
  return { invoices: [], confirmation };
}

async function issueSubscriptionInvoice(transactionId) {
  const tx = await MonriTransaction.findOne({
    $or: [
      { _id: transactionId },
      { orderNumber: String(transactionId) },
    ],
  }).lean();
  if (!tx) throw new Error("subscription_transaction_not_found");
  if (tx.status !== "paid") return null;
  if (tx.orderType !== "subscription") {
    throw new Error("not_a_subscription_transaction");
  }

  const existing = await BillkoInvoice.findOne({
    orderNumber: tx.orderNumber,
    kind: "subscription",
  });
  if (existing?.billkoId) return existing;

  const User = require("mongoose").model("User");
  const user = await User.findById(tx.userId)
    .select("firstName lastName email companyDetails")
    .lean();
  const organization = await Organizations.findOne({ creator: tx.userId })
    .select("basicInfo location")
    .lean();

  const payload = buildSubscriptionInvoicePayload({
    transaction: tx,
    user,
    organization,
  });

  return ensureInvoice({
    kind: "subscription",
    seller: "pleis",
    apiKey: getPleisBillkoApiKey(),
    payload,
    orderType: "subscription",
    orderId: tx._id,
    orderNumber: tx.orderNumber,
    organization: organization?._id,
    companyOrganizer: tx.userId,
    user: tx.userId,
    uniqueCodePrefix: "SUB-",
  });
}

function productsForPartialStorno(invoice, refundAmount) {
  const rawProducts = Array.isArray(invoice?.rawResponse?.products)
    ? invoice.rawResponse.products
    : [];
  const lines = rawProducts
    .map((product) => ({
      uniqueCode: product.uniqueCode,
      name: product.name,
      type: product.type,
      quantity: Number(product.quantity) || 1,
      unitRetailPrice: toGross(product.unitRetailPrice),
      taxRateLabels: product.taxRateLabels,
      ...(product.note ? { note: product.note } : {}),
    }))
    .filter((line) => line.uniqueCode && line.taxRateLabels?.[0]);
  if (!lines.length) {
    return [
      {
        uniqueCode: `RST-${String(invoice.billkoId || invoice._id).slice(0, 12)}`,
        name: "Ticket refund",
        type: 4,
        quantity: 1,
        unitRetailPrice: toGross(refundAmount),
        taxRateLabels: (invoice.taxRateLabels || []).slice(0, 1),
      },
    ].filter((line) => line.taxRateLabels?.[0]);
  }
  return scaleLinesToGross(lines, refundAmount);
}

/**
 * Ticket invoice storno after a Monri refund.
 * - Service fee invoices are kept by default (Billko §4.5 / product rule).
 * - Full ticket amount → POST /invoices/refund.
 * - Partial → createInvoice transactionType 1 + referentDocumentNumber/DT.
 * Live Billko calls only when BILLKO_STORNO_ENABLED=true (and execute !== false).
 */
async function stornoTicketingInvoices(
  orderId,
  { execute = true, refundAmount = null } = {},
) {
  const orderKey = String(orderId);
  const orderFilter = {
    $or: [{ orderId }, { orderNumber: orderKey }],
  };
  const invoices = await BillkoInvoice.find({
    ...orderFilter,
    kind: { $in: ["tickets"] },
    status: { $in: ["created", "fiscalized"] },
  }).lean();
  const skippedFee = await BillkoInvoice.find({
    ...orderFilter,
    kind: "service_fee",
  })
    .select("_id kind status amount")
    .lean();

  const live = execute !== false && isBillkoStornoEnabled();
  const planned = invoices.map((row) => {
    const full = isFullTicketRefund(refundAmount, row.amount);
    return {
      invoiceId: String(row._id),
      billkoId: row.billkoId || null,
      mode: full ? "full_refund_endpoint" : "partial_create_refund_invoice",
      refundAmount: full ? row.amount : toGross(refundAmount),
    };
  });

  if (!live) {
    return {
      plannedTicketStornos: planned,
      skippedServiceFee: skippedFee.map((row) => String(row._id)),
      executed: false,
      reason: "live_billko_storno_disabled",
    };
  }

  const results = [];
  for (const invoice of invoices) {
    const seller =
      invoice.seller === "pleis"
        ? { apiKey: getPleisBillkoApiKey() }
        : await getOrganizerSeller(invoice.companyOrganizer);
    const full = isFullTicketRefund(refundAmount, invoice.amount);

    if (full) {
      const remote = await refundInvoice(seller.apiKey, {
        invoiceId: invoice.billkoId,
        invoiceFormat: InvoiceFormat.A4Paper,
        fiscalizeInvoice: true,
      });
      await BillkoInvoice.updateOne(
        { _id: invoice._id },
        { $set: { status: "refunded", lastError: "", rawResponse: remote } },
      );
      results.push({ mode: "full_refund_endpoint", remote });
      continue;
    }

    const referentDocumentNumber = invoice.invoiceNumber;
    const referentDocumentDT = resolveReferentDocumentDT(invoice);
    if (!referentDocumentNumber || !referentDocumentDT) {
      const error = new Error("billko_partial_storno_missing_referent");
      error.statusCode = 400;
      throw error;
    }

    const products = productsForPartialStorno(invoice, refundAmount);
    if (!products.length) {
      const error = new Error("billko_partial_storno_no_products");
      error.statusCode = 400;
      throw error;
    }

    const paymentType =
      invoice.rawResponse?.payment?.[0]?.paymentType != null
        ? invoice.rawResponse.payment[0].paymentType
        : 2;
    const billingInformation = invoice.rawResponse?.billingInformation;
    if (!billingInformation) {
      const error = new Error("billko_partial_storno_missing_billing");
      error.statusCode = 400;
      throw error;
    }

    const priorPartials = await BillkoInvoice.countDocuments({
      orderId: invoice.orderId,
      kind: "refund_storno",
    });
    const stornoOrderNumber = `${invoice.orderNumber}-RST-${priorPartials + 1}`;
    const payload = buildPartialRefundInvoicePayload({
      orderNumber: stornoOrderNumber,
      products,
      paymentType,
      billingInformation,
      referentDocumentNumber,
      referentDocumentDT,
      note: `Partial refund of ${invoice.invoiceNumber}`,
    });

    let remote;
    try {
      remote = await createInvoice(seller.apiKey, payload);
    } catch (error) {
      failUnrecoverable(error);
    }

    const created = await BillkoInvoice.findOneAndUpdate(
      { orderNumber: stornoOrderNumber, kind: "refund_storno" },
      {
        $set: {
          kind: "refund_storno",
          seller: invoice.seller,
          orderType: invoice.orderType,
          orderId: invoice.orderId,
          orderNumber: stornoOrderNumber,
          organization: invoice.organization,
          companyOrganizer: invoice.companyOrganizer,
          user: invoice.user,
          amount: payload.payment?.[0]?.amount || toGross(refundAmount),
          taxRateLabels: (payload.products || [])
            .map((p) => p.taxRateLabels?.[0])
            .filter(Boolean),
          ...persistInvoiceFields(remote, payload),
        },
      },
      { upsert: true, new: true },
    );
    results.push({
      mode: "partial_create_refund_invoice",
      remote,
      refundStornoId: String(created._id),
    });
  }

  return {
    executed: true,
    results,
    skippedServiceFee: skippedFee.map((row) => String(row._id)),
  };
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
  if (kind === "subscription_invoice") {
    return issueSubscriptionInvoice(orderId);
  }
  if (kind === "ticketing_storno") {
    // execute defaults true; live calls still require BILLKO_STORNO_ENABLED=true
    return stornoTicketingInvoices(orderId);
  }

  throw new UnrecoverableError(`unsupported_fiscal_document_kind:${kind}`);
}

async function applyBillkoCallback(payload) {
  const result = payload?.result || payload;
  const billkoId = result?.id || payload?.id;
  const orderNumber = result?.orderNumber || payload?.orderNumber;
  if (!billkoId && !orderNumber) return null;

  const query = billkoId ? { billkoId } : { orderNumber };
  const existing = await BillkoInvoice.findOne(query).lean();
  const update = persistInvoiceFields(result);
  if (existing?.rawResponse) {
    update.rawResponse = {
      ...existing.rawResponse,
      ...update.rawResponse,
      products: existing.rawResponse.products || update.rawResponse.products,
      billingInformation:
        existing.rawResponse.billingInformation ||
        update.rawResponse.billingInformation,
      payment: existing.rawResponse.payment || update.rawResponse.payment,
    };
  }
  const updated = await BillkoInvoice.findOneAndUpdate(query, { $set: update }, { new: true });
  if (!updated) return null;
  await storeInvoicePdfIfAvailable(updated);
  if (updated.kind === "tickets" || updated.kind === "service_fee") {
    await maybeEmailTicketingInvoicePdfs(updated.orderNumber, updated.user);
  }
  return updated;
}

module.exports = {
  handleSuccessfulPayment,
  issueTicketingInvoices,
  issueOrderingConfirmation,
  issueReservationConfirmation,
  issueSubscriptionInvoice,
  stornoTicketingInvoices,
  applyBillkoCallback,
};
