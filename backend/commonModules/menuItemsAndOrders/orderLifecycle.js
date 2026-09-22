/**
 * Fulfilment + payment axes per Pleis Order Statuses / Post-Order Screen Flow.
 *
 * Fulfilment: Pending → Confirmed → Ready (pickup/togo) → Delivered
 * Payment:    Unpaid → Paid
 *
 * Storage: "delivered" is the doc name; legacy "completed" is accepted as alias.
 */

const TERMINAL_FULFILMENT = new Set([
  "cancelled",
  "rejected",
  "expired",
  "delivered",
  "completed",
]);

/** Fulfilment values that mean "handed over" (doc Delivered; legacy completed). */
const DELIVERED_STATUSES = ["delivered", "completed"];

/**
 * Doc §8: Past only when BOTH axes are terminal:
 *   Delivered + Paid, or Delivered + Unpaid-closed, or Cancelled/Rejected/Expired.
 * Delivered + Unpaid stays Active (Mark as Paid / Mark as Unpaid).
 */
const CLOSED_FULFILMENT_STATUSES = ["cancelled", "rejected", "expired"];

/** Mongo: order belongs on the Active board. */
const activeOnOrderBoardMatch = {
  $and: [
    { status: { $nin: CLOSED_FULFILMENT_STATUSES } },
    {
      $nor: [
        {
          status: { $in: DELIVERED_STATUSES },
          paymentStatus: { $in: ["paid", "unpaidClosed"] },
        },
      ],
    },
  ],
};

/** Mongo: order belongs on the Past board. */
const pastOnOrderBoardMatch = {
  $or: [
    { status: { $in: CLOSED_FULFILMENT_STATUSES } },
    {
      status: { $in: DELIVERED_STATUSES },
      paymentStatus: { $in: ["paid", "unpaidClosed"] },
    },
  ],
};

const normalizeFulfilmentStatus = (status) => {
  if (status === "completed") return "delivered";
  return status;
};

const isPickupStyle = (order = {}) => {
  const pickup = String(order.pickupType || "").toLowerCase();
  return (
    pickup === "counter" ||
    pickup === "togo" ||
    pickup === "to_go" ||
    pickup === "togopickup"
  );
};

/**
 * Guest screen after Place order (Post-Order Screen Flow §3–4).
 * Payment screen ONLY when auto-accepted AND Pay now.
 */
const resolvePostOrderFlow = ({
  autoAccepted,
  paymentTiming,
  hideUntilPaid,
  status,
  paymentStatus,
  totalPrice,
}) => {
  const amountDue = Number(totalPrice) > 0;
  const openPaymentScreen =
    hideUntilPaid === true ||
    (autoAccepted === true &&
      paymentTiming === "payNow" &&
      amountDue &&
      paymentStatus !== "paid");

  const nextScreen = openPaymentScreen ? "payment" : "orderStatus";

  let statusCopyKey = "awaiting_confirmation";
  if (status === "confirmed" || status === "ready" || status === "delivered") {
    statusCopyKey = "confirmed_preparing";
  } else if (status === "pending" && hideUntilPaid) {
    statusCopyKey = "awaiting_payment";
  } else if (status === "pending") {
    statusCopyKey = "awaiting_confirmation";
  }

  return {
    nextScreen,
    statusCopyKey,
    paymentDueNow: openPaymentScreen,
    awaitStaffAcceptance: status === "pending" && !hideUntilPaid,
  };
};

const assertFulfilmentTransition = (order, nextRaw) => {
  if (nextRaw == null) return null;
  const current = normalizeFulfilmentStatus(order.status);
  const next = normalizeFulfilmentStatus(nextRaw);

  if (current === next) return next;

  if (TERMINAL_FULFILMENT.has(current) && current !== next) {
    const err = new Error("invalid_fulfilment_transition");
    err.statusCode = 400;
    throw err;
  }

  const pickup = isPickupStyle(order);
  const allowed = {
    pending: ["confirmed", "rejected"],
    confirmed: pickup
      ? ["ready", "cancelled", "delivered"]
      : ["delivered", "cancelled"],
    ready: ["delivered", "cancelled"],
    // legacy rows may still be "sent" / "pendingPayment"
    sent: ["confirmed", "ready", "delivered", "cancelled"],
    pendingPayment: ["confirmed", "cancelled", "rejected"],
    preorder: ["pending", "confirmed", "cancelled"],
  };

  const ok = (allowed[current] || []).includes(next);
  if (!ok) {
    const err = new Error(
      `invalid_fulfilment_transition:${current}->${next}`,
    );
    err.statusCode = 400;
    throw err;
  }

  // Reject / cancel require reasons — enforced by caller when present
  return next;
};

/**
 * Mark as Paid (staff): doc §3.2 — Unpaid + Delivered.
 * Pay-now gateway settlement is separate (finalizer); staff may still settle
 * cash/pay-later after delivery. Allow cash settle from confirmed for ops.
 */
const assertPaymentTransition = (order, nextPaymentStatus) => {
  if (nextPaymentStatus == null) return;
  if (nextPaymentStatus === order.paymentStatus) return;

  if (order.paymentStatus === "paid") {
    const err = new Error("Cant_change_paid_payment_status");
    err.statusCode = 400;
    throw err;
  }

  if (nextPaymentStatus !== "paid") return;

  const fulfilment = normalizeFulfilmentStatus(order.status);
  const payLater = order.paymentTiming === "payLater";
  const delivered = fulfilment === "delivered";

  if (payLater && !delivered) {
    const err = new Error("mark_paid_requires_delivered");
    err.statusCode = 400;
    throw err;
  }
};

/**
 * Staff board action hints for (fulfilment, payment) pair — doc §4.
 */
const resolveStaffNextActions = (order = {}) => {
  const fulfilment = normalizeFulfilmentStatus(order.status);
  const unpaid = order.paymentStatus !== "paid";
  const pickup = isPickupStyle(order);
  const actions = [];

  if (fulfilment === "pending") {
    actions.push("confirm", "reject");
  } else if (fulfilment === "confirmed") {
    if (pickup) actions.push("ready");
    else actions.push("delivered");
    if (unpaid) actions.push("cancel");
  } else if (fulfilment === "ready") {
    actions.push("delivered");
    if (unpaid) actions.push("cancel");
  } else if (fulfilment === "delivered" && unpaid) {
    actions.push("mark_paid", "mark_unpaid", "cancel");
  }

  return actions;
};

/**
 * Guest wallet / status hints after staff moves the order.
 */
const resolveGuestNextStep = (order = {}) => {
  const fulfilment = normalizeFulfilmentStatus(order.status);
  const unpaid = order.paymentStatus !== "paid";
  const amountDue = Number(order.totalPrice) > 0;

  if (fulfilment === "rejected" || fulfilment === "cancelled") {
    return { key: "terminal", payInWallet: false };
  }
  if (!unpaid || !amountDue) {
    return {
      key:
        fulfilment === "delivered"
          ? "closed"
          : fulfilment === "ready"
            ? "collect"
            : "track",
      payInWallet: false,
    };
  }
  // Staff-accepted + Pay now: pay from Wallet after Confirm (Post-Order §4)
  if (
    fulfilment === "confirmed" &&
    order.paymentTiming === "payNow" &&
    unpaid
  ) {
    return { key: "pay_in_wallet", payInWallet: true };
  }
  // Pay later: settle after Delivered
  if (fulfilment === "delivered" && unpaid) {
    return { key: "pay_in_wallet", payInWallet: true };
  }
  if (fulfilment === "pending") {
    return { key: "awaiting_confirmation", payInWallet: false };
  }
  return { key: "track", payInWallet: false };
};

module.exports = {
  DELIVERED_STATUSES,
  CLOSED_FULFILMENT_STATUSES,
  activeOnOrderBoardMatch,
  pastOnOrderBoardMatch,
  TERMINAL_FULFILMENT,
  normalizeFulfilmentStatus,
  isPickupStyle,
  resolvePostOrderFlow,
  assertFulfilmentTransition,
  assertPaymentTransition,
  resolveStaffNextActions,
  resolveGuestNextStep,
};
