/**
 * Customer document enqueue timing (Billko §1.3 + product rules).
 *
 * - Ticketing: Billko fiscal invoices (fee + tickets) once per paid order on first
 *   staff check-in (jobId ticketing_invoices-{orderId}); free / zero-amount skipped.
 *   Doc §1.3/§4 issues at payment; product keeps check-in trigger.
 *   Live Billko create only when BILLKO_FISCALIZE_ENABLED=true; payment confirmation
 *   still issues when the flag is off.
 * - Ordering: payment confirmation only, at payment (paid + amount > 0). No Billko.
 * - Reservation: payment confirmation only, at payment (paid + amount > 0). No Billko.
 *   Free / €0: plain email only (not this queue).
 */
const { TicketingOrders } = require("../bookings/ticketings/TicketingOrders");
const { fireAndForget } = require("../../helperUtils/responseUtil");
const { enqueueFiscalDocument } = require("../../bullmq/queues");

function orderAmount(order) {
  const n = Number(
    order?.priceBreakdown?.finalTotal ?? order?.totalPrice ?? 0,
  );
  return Number.isFinite(n) ? n : 0;
}

function reservationAmount(reservation) {
  const n = Number(reservation?.amount || 0);
  return Number.isFinite(n) ? n : 0;
}

function isMinSpendReservation(reservation) {
  const conditionType =
    reservation?.reservationSnapshot?.conditionType ||
    reservation?.reservationId?.conditionType ||
    reservation?.reservationType?.conditionType ||
    "";
  return (
    conditionType === "minimumSpendOnLocation" ||
    conditionType === "minimumSpend"
  );
}

/**
 * Idempotent via BullMQ jobId. Safe to call on every check-in for the same order.
 */
async function enqueueTicketingInvoicesOnScan(orderId) {
  if (!orderId) return null;
  const order = await TicketingOrders.findById(orderId)
    .select("paymentDetails orderPricing")
    .lean();
  if (!order) return null;
  if (order.paymentDetails?.paymentStatus !== "paid") return null;
  const total = Number(order.orderPricing?.total || 0);
  if (!(total > 0)) return null;

  return enqueueFiscalDocument({
    kind: "ticketing_invoices",
    orderId,
  });
}

/** Payment confirmation only — call when menu order becomes paid. */
function maybeEnqueueOrderingConfirmation(order) {
  if (!order?._id) return;
  if (order.paymentStatus !== "paid") return;
  if (!(orderAmount(order) > 0)) return;

  fireAndForget(
    enqueueFiscalDocument({
      kind: "ordering_confirmation",
      orderId: order._id,
    }),
    "FISCAL_ORDERING_CONFIRMATION",
  );
}

/** Payment confirmation only — call when reservation becomes paid (amount > 0). */
function maybeEnqueueReservationConfirmation(reservation) {
  if (!reservation?._id) return;
  if (reservation.paymentDetails?.paymentStatus !== "paid") return;
  if (!(reservationAmount(reservation) > 0)) return;

  fireAndForget(
    enqueueFiscalDocument({
      kind: "reservation_confirmation",
      orderId: reservation._id,
    }),
    "FISCAL_RESERVATION_CONFIRMATION",
  );
}

module.exports = {
  isMinSpendReservation,
  enqueueTicketingInvoicesOnScan,
  maybeEnqueueOrderingConfirmation,
  maybeEnqueueReservationConfirmation,
};
