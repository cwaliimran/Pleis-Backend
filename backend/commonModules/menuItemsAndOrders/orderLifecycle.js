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

/** Fulfilment values that mean "handed over" (doc Delivered; legacy completed/sent). */
const DELIVERED_STATUSES = ["delivered", "completed", "sent"];

/**
 * Doc §8: Past when fulfilment is canceled/rejected/expired, OR payment is
 * unpaidClosed (walk-away, any fulfilment), OR Delivered + Paid.
 * Delivered + Unpaid stays Active (Mark as Paid / Mark as Unpaid).
 */
const CLOSED_FULFILMENT_STATUSES = ["cancelled", "rejected", "expired"];

/** Mongo: order belongs on the Active board. */
const activeOnOrderBoardMatch = {
  $and: [
    { status: { $nin: CLOSED_FULFILMENT_STATUSES } },
    { paymentStatus: { $ne: "unpaidClosed" } },
    {
      $nor: [
        {
          status: { $in: DELIVERED_STATUSES },
          paymentStatus: "paid",
        },
      ],
    },
  ],
};

/** Mongo: order belongs on the Past board. */
const pastOnOrderBoardMatch = {
  $or: [
    { status: { $in: CLOSED_FULFILMENT_STATUSES } },
    { paymentStatus: "unpaidClosed" },
    {
      status: { $in: DELIVERED_STATUSES },
      paymentStatus: "paid",
    },
  ],
};

const normalizeFulfilmentStatus = (status) => {
  // Doc name is "delivered". Legacy Admin wrote "completed" (paid hand-over)
  // or "sent" (unpaid hand-over awaiting settlement).
  if (status === "completed" || status === "sent") return "delivered";
  return status;
};

const isPickupStyle = (order = {}) => {
  const pickup = String(order.pickupType || "").toLowerCase().replace(/[_-\s]/g, "");
  return (
    pickup === "counter" ||
    pickup === "counterpickup" ||
    pickup === "togo" ||
    pickup === "togopickup" ||
    pickup === "pickup"
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
    // Delivered is fulfilment-terminal for Past when Paid, but doc §7.7 still
    // allows Cancel while Delivered + Unpaid.
    const cancelFromDelivered =
      (current === "delivered" || current === "completed") &&
      next === "cancelled";
    if (!cancelFromDelivered) {
      const err = new Error("invalid_fulfilment_transition");
      err.statusCode = 400;
      throw err;
    }
  }

  const pickup = isPickupStyle(order);
  const allowed = {
    pending: ["confirmed", "rejected"],
    confirmed: pickup
      ? ["ready", "cancelled", "delivered"]
      : ["delivered", "cancelled"],
    ready: ["delivered", "cancelled"],
    // Doc §3.1 / §7.7: Cancel while Delivered + Unpaid
    delivered: ["cancelled"],
    completed: ["cancelled"],
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

/** Payment axis terminal (Past when combined with Delivered). */
const isPaymentSettledOrClosed = (paymentStatus) =>
  paymentStatus === "paid" || paymentStatus === "unpaidClosed";

/**
 * Staff may Mark as Paid / Mark as Unpaid while payment is still open —
 * before or after Delivered. Gateway pay-now settlement is separate.
 * Once paid or unpaidClosed, payment is locked.
 */
const assertPaymentTransition = (order, nextPaymentStatus) => {
  if (nextPaymentStatus == null) return;
  if (nextPaymentStatus === order.paymentStatus) return;

  if (isPaymentSettledOrClosed(order.paymentStatus)) {
    const err = new Error("Cant_change_paid_payment_status");
    err.statusCode = 400;
    throw err;
  }

  if (nextPaymentStatus !== "paid" && nextPaymentStatus !== "unpaidClosed") {
    return;
  }

  // Pending still awaiting Confirm/Reject — settle payment after acceptance.
  const fulfilment = normalizeFulfilmentStatus(order.status);
  if (fulfilment === "pending") {
    const err = new Error(
      nextPaymentStatus === "unpaidClosed"
        ? "mark_unpaid_requires_confirmed"
        : "mark_paid_requires_confirmed"
    );
    err.statusCode = 400;
    throw err;
  }
};

/**
 * Staff board action hints for (fulfilment, payment) pair — doc §4.
 */
const resolveStaffNextActions = (order = {}) => {
  const fulfilment = normalizeFulfilmentStatus(order.status);
  const unpaid = !isPaymentSettledOrClosed(order.paymentStatus);
  const pickup = isPickupStyle(order);
  const actions = [];

  if (fulfilment === "pending") {
    actions.push("confirm", "reject");
  } else if (fulfilment === "confirmed") {
    if (pickup) actions.push("ready");
    else actions.push("delivered");
    if (unpaid) actions.push("mark_paid", "mark_unpaid", "cancel");
  } else if (fulfilment === "ready") {
    actions.push("delivered");
    if (unpaid) actions.push("mark_paid", "mark_unpaid", "cancel");
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
  const unpaid = !isPaymentSettledOrClosed(order.paymentStatus);
  const amountDue = Number(order.totalPrice) > 0;

  if (
    fulfilment === "rejected" ||
    fulfilment === "cancelled" ||
    order.paymentStatus === "unpaidClosed"
  ) {
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
  isPaymentSettledOrClosed,
};
