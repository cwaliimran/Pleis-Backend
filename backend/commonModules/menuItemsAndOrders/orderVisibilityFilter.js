/**
 * Board visibility for menu orders (admin / staff ordermanagement).
 *
 * Per Post-Order Screen Flow + Order Statuses docs:
 * - Staff-accept (auto off): Pending unpaid MUST appear so staff can Confirm / Reject.
 * - Pay later: Confirmed/Pending unpaid MUST appear (settle later).
 * - Auto-accept + Pay now: guest pays before the order is board-visible;
 *   those rows set hideUntilPaid=true at place and stay hidden until paid.
 *
 * €0 orders are never gated.
 */
const awaitingUpfrontPaymentClause = {
  hideUntilPaid: true,
  paymentStatus: "pending",
  totalPrice: { $gt: 0 },
};

/** Mongo match fragment: order is visible on ordermanagement boards. */
const visibleOnOrderBoardMatch = {
  $nor: [awaitingUpfrontPaymentClause],
};

const isAwaitingInAppPayment = (order = {}) => {
  const total = Number(order.totalPrice || 0);
  return (
    order.hideUntilPaid === true &&
    order.paymentStatus === "pending" &&
    total > 0
  );
};

module.exports = {
  awaitingUpfrontPaymentClause,
  awaitingInAppPaymentClause: awaitingUpfrontPaymentClause, // backwards-compatible alias
  visibleOnOrderBoardMatch,
  isAwaitingInAppPayment,
};
