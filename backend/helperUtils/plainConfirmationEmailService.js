/**
 * Plain (non-fiscal) booking confirmation emails for free / €0 / no-payment paths.
 * Uses the same HTML shell as paid payment-confirmation emails
 * (`fiscalDocuments/templates/confirmation-email.html`) for visual parity.
 * Never attaches Billko invoices or Payment Confirmation PDFs.
 * Idempotent via plainConfirmationEmailSentAt (or meta flag on ticketing orders).
 */
const Organizations = require("@OrganizationModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { TicketingBookings } = require("@TicketingBookingsModel");
const MenuOrders = require("@OrdersModel");
const { UserReservations } = require("@UserReservationsModel");
const { Events } = require("../commonModules/events/Event");
const { sendEmailViaMailgun } = require("./emailUtil");
const {
  renderPaymentConfirmationEmailHtml,
  formatZagreb,
  escapeHtml,
} = require("../commonModules/fiscalDocuments/confirmation/htmlRenderer");
const {
  mapOrderItems,
  mapTicketingItems,
} = require("../commonModules/fiscalDocuments/confirmation/helpers");
const {
  resolveLogoSrc,
  logoInlineAttachment,
} = require("../commonModules/fiscalDocuments/shared/logo");
const {
  resolvePleisWeb,
  resolvePleisSupportEmail,
  resolveMailFrom,
} = require("../config/CONSTANTS");
const {
  buildConfirmationOpenUrl,
} = require("../commonModules/fiscalDocuments/api/openAppRedirect");
const {
  findAppUserByIdWithProjectionService,
} = require("../app/usersManagement/usersService");

/** Same visual chrome as paid; copy adjusted so we never mention attachments / fiscal docs. */
const PLAIN_COPY_OVERRIDES = {
  EMAIL_GREETING: "Confirmed,<br>{{CUSTOMER_FIRST_NAME}}.",
  EMAIL_PREHEADER:
    "Your booking is confirmed. {{ORGANIZER_VENUE_NAME}} is expecting you.",
  EMAIL_COVERING:
    "Your confirmation is available in the app under\n              <strong>Wallet → Transaction history</strong>.<br><br>\n              Need help? Write to us at",
};

function isZeroAmount(n) {
  return !(Number(n) > 0);
}

function staticPleisConfig() {
  return {
    pleisLegalName: process.env.PLEIS_LEGAL_NAME || "Utopia Technologies d.o.o.",
    pleisOib: process.env.PLEIS_OIB || "",
    pleisAddress: process.env.PLEIS_ADDRESS || "",
    pleisBrand: process.env.PLEIS_BRAND || "PLEIS",
    pleisWeb: resolvePleisWeb(),
    supportEmail: resolvePleisSupportEmail(),
  };
}

function buildEmailItemRows(items) {
  return (items || [])
    .map((item) => {
      const isMeta = Boolean(item.isOption);
      if (isMeta) {
        return `<tr><td colspan="2" style="padding:4px 0;font-size:12px;color:#6B7280;">${escapeHtml(item.name)}</td></tr>`;
      }
      return `<tr><td style="padding:4px 0;font-size:13px;color:#14181F;">${escapeHtml(item.name)} × ${item.quantity}</td><td align="right" style="padding:4px 0;font-size:13px;font-weight:700;color:#14181F;">${Number(item.amount).toFixed(2)}</td></tr>`;
    })
    .join("");
}

function buildPlainConfirmationView({
  customerName,
  customerEmail,
  confirmationNumber,
  orderReference,
  organizerLegalName,
  organizerVenueName,
  items,
  totalAmount = 0,
  confirmedAt = new Date(),
  locale = "en",
  appDeepLink,
}) {
  const when = formatZagreb(confirmedAt, locale);
  return {
    ...staticPleisConfig(),
    locale,
    logoSrc: resolveLogoSrc({ forEmail: true }),
    confirmationNumber: confirmationNumber || orderReference || "—",
    issuedAtFormatted: when,
    customerName: customerName || "Customer",
    customerEmail: customerEmail || "",
    customerFirstName: (customerName || "Customer").split(" ")[0] || "Customer",
    transactionId: "—",
    orderReference: orderReference || "—",
    paidAtFormatted: when,
    paymentMethod: "Free",
    currency: "EUR",
    totalAmount: Number(totalAmount || 0),
    organizerLegalName: organizerLegalName || organizerVenueName || "Venue",
    organizerVenueName: organizerVenueName || organizerLegalName || "Venue",
    organizerAddress: "",
    organizerOib: "",
    emailItemRowsHtml: buildEmailItemRows(items),
    // Same share-style open URL as paid confirmation emails / fiscal CTA
    // (`GET {API_BASE_URL}app/open?id=…` → com.pleis://wallet/… + store fallback).
    appDeepLink:
      appDeepLink ||
      buildConfirmationOpenUrl(confirmationNumber || orderReference),
    isCancellation: false,
    voucher: null,
  };
}

async function sendPlainConfirmationMail(email, subject, view) {
  const html = renderPaymentConfirmationEmailHtml(view, {
    copyOverrides: PLAIN_COPY_OVERRIDES,
  });
  const inline = [];
  const logo = logoInlineAttachment();
  if (logo && String(view.logoSrc || "").startsWith("cid:")) {
    inline.push(logo);
  }
  return sendEmailViaMailgun(email, subject, html, {
    fromEmail: resolveMailFrom(),
    replyTo: resolvePleisSupportEmail(),
    attachments: [],
    inline,
  });
}

/**
 * Free / €0 ticket orders that are already paid (e.g. FREE_ORDER).
 */
async function maybeSendFreeTicketingConfirmation(orderId) {
  if (!orderId) return { sent: false, reason: "missing_id" };

  // Aggregation pipeline update: meta may be null on FREE_ORDER docs, and
  // Mongo cannot $set a nested field inside a null element.
  const claimed = await TicketingOrders.findOneAndUpdate(
    {
      _id: orderId,
      "paymentDetails.paymentStatus": "paid",
      "orderPricing.total": 0,
      $or: [
        { meta: null },
        { meta: { $exists: false } },
        { "meta.plainConfirmationEmailSentAt": { $exists: false } },
        { "meta.plainConfirmationEmailSentAt": null },
      ],
    },
    [
      {
        $set: {
          meta: {
            $mergeObjects: [
              {
                $cond: [
                  { $eq: [{ $type: "$meta" }, "object"] },
                  "$meta",
                  {},
                ],
              },
              { plainConfirmationEmailSentAt: "$$NOW" },
            ],
          },
        },
      },
    ],
    { new: true },
  ).lean();

  if (!claimed) {
    const existing = await TicketingOrders.findById(orderId)
      .select("paymentDetails orderPricing meta")
      .lean();
    if (!existing) return { sent: false, reason: "not_found" };
    if (existing.meta?.plainConfirmationEmailSentAt) {
      return { sent: false, reason: "already_sent" };
    }
    return { sent: false, reason: "not_free_or_unpaid" };
  }

  try {
    const [userDetails, organization, bookings] = await Promise.all([
      findAppUserByIdWithProjectionService(claimed.user, {
        email: 1,
        username: 1,
        firstName: 1,
      }),
      Organizations.findById(claimed.organization)
        .select("basicInfo.name")
        .lean(),
      TicketingBookings.find({ order: claimed._id }).lean(),
    ]);

    const email = userDetails?.email;
    if (!email) {
      console.warn("[EMAIL] Free ticket confirmation: no recipient email");
      return { sent: false, reason: "no_email" };
    }

    let event = null;
    const eventId =
      claimed.event || bookings?.[0]?.ticket?.snapshot?.event || null;
    if (eventId) {
      try {
        event = await Events.findById(eventId)
          .select("basicInfo.title basicInfo.venueLocation schedule publicId")
          .populate("basicInfo.venue", "title")
          .lean();
      } catch (populateErr) {
        console.warn(
          "[EMAIL] Free ticket event populate fallback:",
          populateErr.message,
        );
        event = await Events.findById(eventId)
          .select("basicInfo.title basicInfo.venueLocation schedule publicId")
          .lean();
      }
    }

    const organizationName = organization?.basicInfo?.name || "Venue";
    const venueName =
      event?.basicInfo?.venue?.title ||
      event?.basicInfo?.venueLocation?.fullAddress ||
      event?.basicInfo?.venueLocation?.city ||
      organizationName;
    const customerName =
      userDetails?.firstName || userDetails?.username || "Customer";
    const orderReference =
      event?.publicId || event?.basicInfo?.title || String(claimed._id);
    const items = mapTicketingItems({
      ticketLines: [],
      bookings: bookings || [],
      event,
      organization,
      serviceFee: 0,
      locale: "en",
    });

    const view = buildPlainConfirmationView({
      customerName,
      customerEmail: email,
      confirmationNumber: String(claimed._id),
      orderReference,
      organizerLegalName: organizationName,
      organizerVenueName: venueName,
      items,
      totalAmount: 0,
      confirmedAt: claimed.updatedAt || claimed.createdAt || new Date(),
    });

    const mailResult = await sendPlainConfirmationMail(
      email,
      "Ticket confirmed",
      view,
    );
    if (!mailResult?.success) {
      console.error(
        "[EMAIL] Free ticket confirmation Mailgun failed:",
        mailResult?.error?.message || mailResult?.error,
      );
      await TicketingOrders.updateOne(
        { _id: orderId },
        { $unset: { "meta.plainConfirmationEmailSentAt": 1 } },
      ).catch(() => {});
      return { sent: false, reason: "mailgun_failed", error: mailResult?.error };
    }
    console.log("[EMAIL] Ticket confirmed sent to", email);
    return { sent: true, email };
  } catch (err) {
    console.error("[EMAIL] Free ticket confirmation error:", err);
    await TicketingOrders.updateOne(
      { _id: orderId },
      { $unset: { "meta.plainConfirmationEmailSentAt": 1 } },
    ).catch(() => {});
    return { sent: false, reason: "error", error: err };
  }
}

/**
 * €0 menu orders — plain order confirmation (no payment-confirmation PDF).
 */
async function maybeSendFreeMenuOrderConfirmation(orderId) {
  if (!orderId) return { sent: false, reason: "missing_id" };

  const claimed = await MenuOrders.findOneAndUpdate(
    {
      _id: orderId,
      plainConfirmationEmailSentAt: null,
      $or: [{ totalPrice: 0 }, { "priceBreakdown.finalTotal": 0 }],
    },
    { $set: { plainConfirmationEmailSentAt: new Date() } },
    { new: true },
  )
    .populate("organization", "basicInfo.name")
    .lean();

  if (!claimed) {
    const existing = await MenuOrders.findById(orderId)
      .select("totalPrice priceBreakdown plainConfirmationEmailSentAt")
      .lean();
    if (!existing) return { sent: false, reason: "not_found" };
    if (existing.plainConfirmationEmailSentAt) {
      return { sent: false, reason: "already_sent" };
    }
    return { sent: false, reason: "not_zero" };
  }

  const amount = Number(
    claimed.priceBreakdown?.finalTotal ?? claimed.totalPrice ?? 0,
  );
  if (amount > 0) {
    await MenuOrders.updateOne(
      { _id: orderId },
      { $unset: { plainConfirmationEmailSentAt: 1 } },
    );
    return { sent: false, reason: "not_zero" };
  }

  try {
    const userDetails = await findAppUserByIdWithProjectionService(
      claimed.user,
      { email: 1, username: 1, firstName: 1 },
    );
    const email = userDetails?.email;
    if (!email) {
      console.warn("[EMAIL] Free order confirmation: no recipient email");
      return { sent: false, reason: "no_email" };
    }

    const organizationName =
      claimed.organization?.basicInfo?.name || "Venue";
    const customerName =
      userDetails?.firstName || userDetails?.username || "Customer";
    const orderReference =
      claimed.orderNumber || String(claimed._id);
    const items = mapOrderItems(claimed, "en");

    const view = buildPlainConfirmationView({
      customerName,
      customerEmail: email,
      confirmationNumber: orderReference,
      orderReference,
      organizerLegalName: organizationName,
      organizerVenueName: organizationName,
      items,
      totalAmount: 0,
      confirmedAt: claimed.createdAt || new Date(),
    });

    const mailResult = await sendPlainConfirmationMail(
      email,
      "Order confirmed",
      view,
    );
    if (!mailResult?.success) {
      console.error(
        "[EMAIL] Free order confirmation Mailgun failed:",
        mailResult?.error?.message || mailResult?.error,
      );
      await MenuOrders.updateOne(
        { _id: orderId },
        { $unset: { plainConfirmationEmailSentAt: 1 } },
      ).catch(() => {});
      return { sent: false, reason: "mailgun_failed", error: mailResult?.error };
    }
    console.log("[EMAIL] Order confirmed sent to", email);
    return { sent: true, email };
  } catch (err) {
    console.error("[EMAIL] Free order confirmation error:", err);
    await MenuOrders.updateOne(
      { _id: orderId },
      { $unset: { plainConfirmationEmailSentAt: 1 } },
    ).catch(() => {});
    return { sent: false, reason: "error", error: err };
  }
}

/**
 * Free / no-upfront-payment reservations that are confirmed and never fiscalized.
 * amount must be €0 (skips paid and min-spend prepaid). Idempotent.
 */
async function maybeSendFreeReservationConfirmation(reservationId) {
  if (!reservationId) return { sent: false, reason: "missing_id" };

  const claimed = await UserReservations.findOneAndUpdate(
    {
      _id: reservationId,
      status: "confirmed",
      plainConfirmationEmailSentAt: null,
      $or: [{ amount: 0 }, { amount: { $exists: false } }, { amount: null }],
    },
    { $set: { plainConfirmationEmailSentAt: new Date() } },
    { new: true },
  ).lean();

  if (!claimed) {
    const existing = await UserReservations.findById(reservationId)
      .select("status amount plainConfirmationEmailSentAt")
      .lean();
    if (!existing) return { sent: false, reason: "not_found" };
    if (existing.plainConfirmationEmailSentAt) {
      return { sent: false, reason: "already_sent" };
    }
    if (existing.status !== "confirmed") {
      return { sent: false, reason: "not_confirmed" };
    }
    if (!isZeroAmount(existing.amount)) {
      return { sent: false, reason: "not_free" };
    }
    return { sent: false, reason: "skipped" };
  }

  try {
    let email = claimed.email || null;
    let userName =
      [claimed.firstName, claimed.lastName].filter(Boolean).join(" ") ||
      "Customer";

    if (claimed.userId) {
      const userDetails = await findAppUserByIdWithProjectionService(
        claimed.userId,
        { email: 1, username: 1, firstName: 1 },
      );
      email = userDetails?.email || email;
      userName =
        userDetails?.firstName ||
        userDetails?.username ||
        userName;
    }

    if (!email) {
      console.warn(
        "[EMAIL] Free reservation confirmation: no recipient email",
      );
      return { sent: false, reason: "no_email" };
    }

    const organization = await Organizations.findById(claimed.organizationId)
      .select("basicInfo.name")
      .lean();

    const organizationName = organization?.basicInfo?.name || "Venue";
    const reservationTypeLabel =
      claimed.reservationSnapshot?.reservationType ||
      claimed.reservationSnapshot?.title ||
      "Reservation";
    const orderReference =
      claimed.bookingId || String(claimed._id);
    const items = [
      {
        name: reservationTypeLabel,
        quantity: 1,
        unitPrice: 0,
        amount: 0,
      },
    ];

    const view = buildPlainConfirmationView({
      customerName: userName,
      customerEmail: email,
      confirmationNumber: orderReference,
      orderReference,
      organizerLegalName: organizationName,
      organizerVenueName: organizationName,
      items,
      totalAmount: 0,
      confirmedAt: claimed.updatedAt || claimed.createdAt || new Date(),
    });

    const mailResult = await sendPlainConfirmationMail(
      email,
      "Reservation confirmed",
      view,
    );
    if (!mailResult?.success) {
      console.error(
        "[EMAIL] Free reservation confirmation Mailgun failed:",
        mailResult?.error?.message || mailResult?.error,
      );
      await UserReservations.updateOne(
        { _id: reservationId },
        { $unset: { plainConfirmationEmailSentAt: 1 } },
      ).catch(() => {});
      return { sent: false, reason: "mailgun_failed", error: mailResult?.error };
    }
    console.log("[EMAIL] Reservation confirmed sent to", email);
    return { sent: true, email };
  } catch (err) {
    console.error("[EMAIL] Free reservation confirmation error:", err);
    await UserReservations.updateOne(
      { _id: reservationId },
      { $unset: { plainConfirmationEmailSentAt: 1 } },
    ).catch(() => {});
    return { sent: false, reason: "error", error: err };
  }
}

module.exports = {
  maybeSendFreeTicketingConfirmation,
  maybeSendFreeMenuOrderConfirmation,
  maybeSendFreeReservationConfirmation,
};
