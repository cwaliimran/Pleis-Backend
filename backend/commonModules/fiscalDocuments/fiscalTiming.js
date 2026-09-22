/**
 * Customer fiscal-document enqueue timing (product override of Billko-at-payment).
 *
 * - Ticketing: once per paid order on first staff check-in (jobId ticketing_invoices-{orderId});
 *   free / zero-amount orders skipped
 * - Ordering: when status=completed AND paymentStatus=paid AND amount>0
 * - Reservation: only min-spend, once on first voucher spend (full voucher face value).
 *   Free and paid non-min-spend reservations never enqueue.
 */
const { TicketingOrders } = require("../bookings/ticketings/TicketingOrders");
const { UserReservations } = require("@UserReservationsModel");
const { fireAndForget } = require("../../helperUtils/responseUtil");
const { enqueueFiscalDocument } = require("../../bullmq/queues");

const ORDERING_DELIVERED_STATUS = "completed";

function orderAmount(order) {
  const n = Number(
    order?.priceBreakdown?.finalTotal ?? order?.totalPrice ?? 0,
  );
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

function maybeEnqueueOrderingConfirmation(order) {
  if (!order?._id) return;
  if (order.paymentStatus !== "paid") return;
  if (String(order.status) !== ORDERING_DELIVERED_STATUS) return;
  if (!(orderAmount(order) > 0)) return;

  fireAndForget(
    enqueueFiscalDocument({
      kind: "ordering_confirmation",
      orderId: order._id,
    }),
    "FISCAL_ORDERING_CONFIRMATION",
  );
}

/**
 * Min-spend voucher: enqueue reservation_confirmation once on first spend.
 * Call on any successful voucher apply; jobId + fiscalDocumentEnqueuedAt prevent duplicates.
 * Confirmation fiscalizes the full original voucher face value (not the partial spend).
 */
async function maybeEnqueueReservationVoucherFiscal(reservationId, {
  voucherAmountApplied = 0,
} = {}) {
  if (!reservationId || !(Number(voucherAmountApplied) > 0)) return null;

  const reservation = await UserReservations.findById(reservationId)
    .select("voucher")
    .lean();
  if (!(Number(reservation?.voucher?.discountAmount) > 0)) return null;
  if (reservation.voucher.fiscalDocumentEnqueuedAt) return null;

  const job = await enqueueFiscalDocument({
    kind: "reservation_confirmation",
    orderId: reservationId,
  });

  await UserReservations.updateOne(
    { _id: reservationId, "voucher.fiscalDocumentEnqueuedAt": null },
    { $set: { "voucher.fiscalDocumentEnqueuedAt": new Date() } },
  );

  return job;
}

module.exports = {
  ORDERING_DELIVERED_STATUS,
  isMinSpendReservation,
  enqueueTicketingInvoicesOnScan,
  maybeEnqueueOrderingConfirmation,
  maybeEnqueueReservationVoucherFiscal,
};
