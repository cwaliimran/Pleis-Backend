/**
 * In-app (card / Apple Pay) pay-now orders must not appear on staff/admin
 * order boards until payment succeeds. Cash / pay-later unpaid orders do.
 *
 * €0 orders are never gated — there is nothing to charge.
 */
const awaitingInAppPaymentClause = {
  paymentMethod: { $in: ["card", "applePay"] },
  paymentStatus: "pending",
  totalPrice: { $gt: 0 },
};

/** Mongo match fragment: order is visible on ordermanagement boards. */
const visibleOnOrderBoardMatch = {
  $nor: [awaitingInAppPaymentClause],
};

const isAwaitingInAppPayment = (order = {}) => {
  const method = order.paymentMethod;
  const status = order.paymentStatus;
  const total = Number(order.totalPrice || 0);
  return (
    (method === "card" || method === "applePay") &&
    status === "pending" &&
    total > 0
  );
};

module.exports = {
  awaitingInAppPaymentClause,
  visibleOnOrderBoardMatch,
  isAwaitingInAppPayment,
};
