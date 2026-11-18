const {
  resolvePleisWeb,
  resolvePleisAppScheme,
  resolvePleisIosStoreUrl,
  resolvePleisAndroidStoreUrl,
  buildPleisLink,
} = require("../../../config/CONSTANTS");
const { renderSmartOpenHtml, sendSmartOpen } = require("../../../helperUtils/appDeepLinkUtil");

function sanitizeOpenId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 64);
}

function storeUrls() {
  return {
    ios: resolvePleisIosStoreUrl(),
    android: resolvePleisAndroidStoreUrl(),
    web: resolvePleisWeb(),
    scheme: resolvePleisAppScheme(),
  };
}

function buildAppSchemeLink(confirmationNumber) {
  const { scheme } = storeUrls();
  const id = sanitizeOpenId(confirmationNumber);
  return id ? `${scheme}://wallet/${id}` : `${scheme}://wallet`;
}

function buildConfirmationOpenUrl(confirmationNumber) {
  const id = encodeURIComponent(sanitizeOpenId(confirmationNumber) || "wallet");
  return buildPleisLink(`api/v1/app/open?id=${id}`) || resolvePleisWeb();
}

function renderOpenAppHtml(confirmationNumber) {
  return renderSmartOpenHtml({
    appLink: buildAppSchemeLink(confirmationNumber),
    title: "PLEIS",
  });
}

function openConfirmationInApp(req, res) {
  const id = req.query.id || req.query.confirmation || "";
  return sendSmartOpen(req, res, { appLink: buildAppSchemeLink(id), title: "PLEIS" });
}

/**
 * What an "Open in the app" email link points to, for the logged-in guest
 * (`GET /app/open/resolve?id=…`). The email link opens the app with
 * `com.pleis://wallet/<id>` and the app asks this which screen to show.
 *
 * The id is whatever the email carried: a confirmation number (PC-…), a menu
 * order number, a reservation booking id, or the order / reservation /
 * ticket order id itself. Only the guest's own order, reservation or tickets
 * resolve; anything else (unknown id, someone else's) is `{ type: "wallet" }`,
 * so the app still opens, on Wallet → Transaction history.
 *
 * Returns one of:
 *   { type: "order", orderId }
 *   { type: "reservation", reservationId }
 *   { type: "ticket", bookingId }        the guest's one ticket in the order
 *   { type: "tickets", ticketOrderId }   several tickets: the Tickets tab
 *   { type: "wallet" }
 */
async function resolveOpenTarget({ id, userId }) {
  const PaymentConfirmation = require("../models/PaymentConfirmation.model");
  const Orders = require("@OrdersModel");
  const { UserReservations } = require("@UserReservationsModel");
  const { TicketingOrders } = require("@TicketingOrdersModel");
  const { TicketingBookings } = require("@TicketingBookingsModel");

  const wallet = { type: "wallet" };
  const ref = sanitizeOpenId(id);
  if (!ref || !userId) return wallet;
  const me = String(userId);

  const forOrder = async (orderId) => {
    const order = await Orders.findById(orderId).select("user").lean();
    return order && String(order.user) === me ? { type: "order", orderId: String(order._id) } : null;
  };
  const forReservation = async (reservationId) => {
    const reservation = await UserReservations.findById(reservationId).select("userId").lean();
    return reservation && String(reservation.userId) === me
      ? { type: "reservation", reservationId: String(reservation._id) }
      : null;
  };
  // Tickets can be transferred, so it is the guest's tickets in the order
  // that count, not who bought them.
  const forTicketOrder = async (ticketOrderId) => {
    const bookings = await TicketingBookings.find({ order: ticketOrderId, user: userId })
      .select("_id")
      .limit(2)
      .lean();
    if (bookings.length === 1) return { type: "ticket", bookingId: String(bookings[0]._id) };
    if (bookings.length > 1) return { type: "tickets", ticketOrderId: String(ticketOrderId) };
    return null;
  };
  const byModule = { ORDERING: forOrder, RESERVATION: forReservation, TICKETING: forTicketOrder };

  const confirmation = await PaymentConfirmation.findOne({ confirmationNumber: ref })
    .select("module orderId")
    .lean();
  if (confirmation) {
    return (await byModule[confirmation.module]?.(confirmation.orderId)) || wallet;
  }

  const order = await Orders.findOne({ orderNumber: ref }).select("_id").lean();
  if (order) return (await forOrder(order._id)) || wallet;

  const reservation = await UserReservations.findOne({ bookingId: ref }).select("_id").lean();
  if (reservation) return (await forReservation(reservation._id)) || wallet;

  if (/^[a-f0-9]{24}$/i.test(ref)) {
    return (
      (await forOrder(ref)) ||
      (await forReservation(ref)) ||
      ((await TicketingOrders.exists({ _id: ref })) && (await forTicketOrder(ref))) ||
      wallet
    );
  }
  return wallet;
}

async function resolveOpenLink(req, res) {
  const { sendResponse } = require("../../../helperUtils/responseUtil");
  let data = { type: "wallet" };
  try {
    data = await resolveOpenTarget({ id: req.query.id, userId: req.user?._id });
  } catch (error) {
    // Never leave the guest on an error: the app opens Wallet instead.
    console.error("[open] resolve failed:", error.message);
  }
  return sendResponse({ res, statusCode: 200, translationKey: "data_fetched_successfully", data });
}

module.exports = {
  buildConfirmationOpenUrl,
  buildAppSchemeLink,
  renderOpenAppHtml,
  openConfirmationInApp,
  resolveOpenTarget,
  resolveOpenLink,
};
