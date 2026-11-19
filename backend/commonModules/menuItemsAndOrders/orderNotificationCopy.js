/**
 * Picks a full, readable push sentence for an order status instead of putting
 * the raw status code ("pending", "pendingPayment") into a sentence. Each key
 * exists in every assets/locales/notifications/*.json file.
 */

// The apps show sent / completed as Delivered, so the push says the same.
const GUEST_STATUS_BODY_KEYS = {
  pendingPayment: "order_status_pending_payment_body",
  pending: "order_status_pending_body",
  confirmed: "order_status_confirmed_body",
  ready: "order_status_ready_body",
  sent: "order_status_delivered_body",
  delivered: "order_status_delivered_body",
  completed: "order_status_delivered_body",
  cancelled: "order_status_cancelled_body",
  rejected: "order_status_rejected_body",
  preorder: "order_status_preorder_body",
  expired: "order_status_expired_body",
};

const STAFF_NEW_ORDER_BODY_KEYS = {
  pending: "new_order_placed_pending_body",
  confirmed: "new_order_placed_confirmed_body",
};

/**
 * Guest "Order updated" body. When only the delivery details changed (status
 * did not move), the generic "has been updated" sentence is used.
 */
const guestOrderStatusBodyKey = (status, { statusChanged = true } = {}) =>
  (statusChanged && GUEST_STATUS_BODY_KEYS[status]) || "order_updated_body";

/** Staff "New Order Placed" body for the status the order lands on the board with. */
const staffNewOrderBodyKey = (status) =>
  STAFF_NEW_ORDER_BODY_KEYS[status] || "new_order_placed_body";

/** 9.9 → "9.90" */
const formatOrderAmount = (amount) => {
  const value = Number(amount);
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
};

module.exports = {
  guestOrderStatusBodyKey,
  staffNewOrderBodyKey,
  formatOrderAmount,
};
