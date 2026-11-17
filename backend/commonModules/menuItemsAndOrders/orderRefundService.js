/**
 * Refund of a paid menu order (Monri Integration v1.4 §6; Requirement Set v13.8).
 *
 * Automatic triggers (§6.4): staff / organizer / admin rejects or cancels an
 * order that was already paid (order_rejected_after_capture), and a capture
 * that arrives after the order was cancelled or expired (late_capture).
 *
 * Rules applied here:
 *   - Full refund only, at most once per order (atomic claim on order.refund).
 *   - Card part goes back through Monri on the original order_number; the
 *     voucher part goes back to the reservation voucher (§6.10). An order
 *     paid fully by voucher needs no Monri call (channel voucher).
 *   - Only before payout (§6.2): an order already in a statement or paid out
 *     is refused (cancel the statement first / the organizer refunds directly).
 *   - Monri declines → failed, retried once after 24 h, then operations (§6.9).
 *     No answer (timeout) → stays pending for operations, never retried blind.
 *   - On approval: order paymentStatus refunded (statements skip it), the
 *     Monri row refunded, the payment confirmation cancelled (storno, §6.6).
 *
 * Not built yet (spec §6.1 / §6.5): reverse ledger row, 2 % refund cost row,
 * loyalty points reversal.
 */
const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const MonriTransaction = require("../paymentsIntegrations/monri/MonriTransaction");
const PaymentLedgerEntry = require("../paymentsIntegrations/ledger/PaymentLedgerEntry.model");
const {
  isLiveRefundEnabled,
  refundViaMonri,
  planMonriRefund,
} = require("../paymentsIntegrations/monri/refundService");
const { releaseOrderVoucher } = require("./orderVoucherRelease");
const { isPleisMethod } = require("./paymentMethods");

const DECLINE_RETRY_MS = 24 * 60 * 60 * 1000;
const DISABLED_RETRY_MS = 60 * 60 * 1000;
const NOT_DELIVERED_RETRY_MS = 10 * 60 * 1000;
const MAX_MONRI_ATTEMPTS = 2; // first try + one retry after 24 h

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

/** Paid through Pleis (Monri and/or reservation voucher), so Pleis refunds it. */
function isRefundableThroughPleis(order) {
  if (!order || order.paymentStatus !== "paid") return false;
  const voucherPaid = Number(order.priceBreakdown?.voucherDiscount || 0) > 0;
  return isPleisMethod(order.paymentMethod) || order.paymentMethod === "voucher" || voucherPaid;
}

/** §6.2: Pleis refunds only before payout. Throws 409 when the money already moved on. */
async function assertRefundablePayoutState(orderId) {
  const entry = await PaymentLedgerEntry.findOne({ orderId, module: "ORDERING" })
    .select("payoutStatus statementId")
    .lean();
  if (!entry) return;
  if (entry.payoutStatus === "PAID") {
    throw httpError(409, "refund_after_payout_organizer_refunds");
  }
  if (entry.statementId) {
    throw httpError(409, "refund_blocked_by_statement");
  }
}

function cardPartCents(order) {
  if (!isPleisMethod(order.paymentMethod)) return 0;
  return Math.round(Number(order.totalPrice || 0) * 100);
}

async function markRefund(orderId, set) {
  const $set = {};
  for (const [k, v] of Object.entries(set)) $set[`refund.${k}`] = v;
  return MenuOrders.findByIdAndUpdate(orderId, { $set }, { new: true });
}

async function issueStorno(order) {
  try {
    const PaymentConfirmation = require("../fiscalDocuments/models/PaymentConfirmation.model");
    const { issueCancellationConfirmation } = require("../fiscalDocuments/confirmation/generator");
    const original = await PaymentConfirmation.findOne({
      orderId: order._id,
      $or: [{ cancelsConfirmationId: null }, { cancelsConfirmationId: { $exists: false } }],
      status: "ISSUED",
    });
    if (original) {
      // No amount: the cancellation repeats the original's full amount.
      await issueCancellationConfirmation(original, { transactionId: order.transactionId || undefined });
    }
  } catch (err) {
    console.error(`[order-refund] storno document ${order._id}:`, err.message);
  }
}

function emitRefundUpdate(order) {
  try {
    const { emitOrderEvent, emitOrderUpdate } = require("@socketIo/orders/orderSocketEmitter");
    const { isAwaitingInAppPayment } = require("./orderVisibilityFilter");
    if (order.hideUntilPaid === true || isAwaitingInAppPayment(order)) {
      // Never shown to staff (late capture on an expired order): guest only.
      emitOrderEvent({
        io: global.io,
        eventName: "ORDER_UPDATE",
        orderId: order._id,
        organizationId: null,
        userId: order.user,
        data: order,
        updateTypes: ["payment", "refund"],
      });
    } else {
      emitOrderUpdate(order, ["payment", "refund"]);
    }
  } catch (err) {
    console.error("[order-refund] socket:", err.message);
  }
}

/**
 * Refund a paid menu order in full. Safe to call again: a refunded or
 * in-flight refund is returned as is.
 *
 * @returns {{ status: "refunded"|"pending"|"failed", channel?, error? }}
 */
async function refundPaidMenuOrder({ orderId, reasonCode, requestedBy = null, skipPayoutCheck = false }) {
  const order = await MenuOrders.findById(orderId).lean();
  if (!order) throw httpError(404, "order_not_found");
  if (order.refund?.status === "refunded" || order.paymentStatus === "refunded") {
    return { status: "refunded", alreadyDone: true };
  }
  if (!isRefundableThroughPleis(order)) {
    throw httpError(409, "order_not_refundable");
  }
  if (!skipPayoutCheck) await assertRefundablePayoutState(order._id);

  // Claim: one refund per order at a time; a failed one may be retried.
  const claimed = await MenuOrders.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: "paid",
      "refund.status": { $in: [null, "failed"] },
      "refund.needsOperations": { $ne: true },
    },
    {
      $set: {
        "refund.status": "pending",
        "refund.reasonCode": order.refund?.reasonCode || reasonCode,
        "refund.requestedBy": order.refund?.requestedBy || requestedBy,
        "refund.requestedAt": order.refund?.requestedAt || new Date(),
        "refund.lastError": null,
        "refund.nextRetryAt": null,
      },
    },
    { new: true },
  ).lean();
  if (!claimed) {
    const current = await MenuOrders.findById(order._id).select("refund").lean();
    return { status: current?.refund?.status || "pending", inProgress: true };
  }

  const cardCents = cardPartCents(claimed);
  const orderNumber = String(claimed._id);
  let tx = null;
  let monriResponse = null;

  if (cardCents > 0) {
    tx = await MonriTransaction.findOne({ orderNumber }).lean();
    const plan = planMonriRefund({ tx, amount: tx?.amount });
    if (!plan.ok) {
      await markRefund(claimed._id, { status: "failed", needsOperations: true, lastError: plan.error });
      console.error(`[order-refund] ${orderNumber} not refundable at Monri: ${plan.error}`);
      return { status: "failed", error: plan.error };
    }
    if (!isLiveRefundEnabled()) {
      await markRefund(claimed._id, {
        status: "failed",
        lastError: "live_refund_disabled",
        nextRetryAt: new Date(Date.now() + DISABLED_RETRY_MS),
      });
      console.warn(`[order-refund] ${orderNumber} waiting: MONRI_LIVE_REFUND_ENABLED is off`);
      return { status: "failed", error: "live_refund_disabled" };
    }

    const attempts = Number(claimed.refund?.attempts || 0) + 1;
    try {
      const result = await refundViaMonri({
        orderNumber,
        amountCents: tx.amount,
        currency: tx.currency || "EUR",
      });
      monriResponse = result.response;
      if (result.outcome !== "approved") {
        const giveUp = attempts >= MAX_MONRI_ATTEMPTS;
        await markRefund(claimed._id, {
          status: "failed",
          attempts,
          monriResponse,
          lastError: monriResponse?.response_message || monriResponse?.error || "monri_refund_declined",
          nextRetryAt: giveUp ? null : new Date(Date.now() + DECLINE_RETRY_MS),
          needsOperations: giveUp,
        });
        return { status: "failed", error: "monri_refund_declined" };
      }
    } catch (err) {
      if (err.code === "MONRI_REFUND_NOT_DELIVERED") {
        // Never reached Monri (Cloudflare 521/522/523): nothing refunded, try again soon.
        await markRefund(claimed._id, {
          status: "failed",
          lastError: err.message,
          nextRetryAt: new Date(Date.now() + NOT_DELIVERED_RETRY_MS),
        });
        console.warn(`[order-refund] ${orderNumber} refund not delivered to Monri; retry in 10 min`);
        return { status: "failed", error: "monri_unreachable" };
      }
      // No answer: never retried blind; operations resolve it with Monri.
      await markRefund(claimed._id, {
        status: "pending",
        attempts,
        needsOperations: true,
        lastError: err.message,
        monriResponse: err.response || null,
      });
      console.error(`[order-refund] ${orderNumber} unknown Monri answer:`, err.message);
      return { status: "pending", error: "monri_refund_unknown" };
    }
  }

  // Approved (or nothing to send to Monri): record it, give the voucher back.
  const session = await mongoose.startSession();
  let refunded = null;
  try {
    await session.withTransaction(async () => {
      const voucherReleased = await releaseOrderVoucher({ order: claimed, session });
      refunded = await MenuOrders.findOneAndUpdate(
        { _id: claimed._id, "refund.status": "pending" },
        {
          $set: {
            paymentStatus: "refunded",
            "refund.status": "refunded",
            "refund.channel": cardCents > 0 ? "monri" : "voucher",
            "refund.amountCents": cardCents > 0 ? Number(tx.amount) : 0,
            "refund.voucherReleased": voucherReleased,
            "refund.refundedAt": new Date(),
            "refund.attempts": cardCents > 0 ? Number(claimed.refund?.attempts || 0) + 1 : 0,
            "refund.monriResponse": monriResponse,
            "refund.lastError": null,
            "refund.nextRetryAt": null,
          },
        },
        { session, new: true },
      );
      if (cardCents > 0) {
        await MonriTransaction.updateOne(
          { orderNumber },
          { $set: { status: "refunded", refundedAmount: Number(tx.amount) } },
          { session },
        );
      }
    });
  } catch (err) {
    // Money is back with the guest but our records failed: flag for operations.
    await markRefund(claimed._id, {
      status: "pending",
      needsOperations: true,
      lastError: `refund_approved_record_failed: ${err.message}`,
      monriResponse,
    }).catch(() => {});
    console.error(`[order-refund] ${orderNumber} approved at Monri but not recorded:`, err.message);
    return { status: "pending", error: "refund_record_failed" };
  } finally {
    session.endSession();
  }

  console.log(
    `[order-refund] refunded ${orderNumber} (${reasonCode})` +
      (cardCents > 0 ? ` card ${tx.amount} cents` : "") +
      (refunded?.refund?.voucherReleased ? `, voucher ${refunded.refund.voucherReleased}` : ""),
  );
  if (refunded) {
    await issueStorno(refunded);
    emitRefundUpdate(refunded);
    // Guest notice: push + Notification Center entry ("Order Refunded").
    try {
      const { sendMenuOrderNotification } = require("../../controllers/notificationHelper/menuOrderNotificationService");
      await sendMenuOrderNotification({ orderId: refunded._id, action: "MENU_ORDER_REFUNDED" });
    } catch (err) {
      console.error(`[order-refund] guest notice ${orderNumber}:`, err.message);
    }
  }
  return { status: "refunded", channel: refunded?.refund?.channel };
}

/** Cron: retry declined refunds once after 24 h, and ones waiting on the live switch. */
async function retryDueMenuOrderRefunds({ limit = 10 } = {}) {
  const due = await MenuOrders.find({
    paymentStatus: "paid",
    "refund.status": "failed",
    "refund.needsOperations": { $ne: true },
    "refund.nextRetryAt": { $ne: null, $lte: new Date() },
  })
    .select("_id refund.reasonCode")
    .limit(limit)
    .lean();
  const summary = { due: due.length, refunded: 0, failed: 0, pending: 0, errors: 0 };
  for (const o of due) {
    try {
      const r = await refundPaidMenuOrder({
        orderId: o._id,
        reasonCode: o.refund?.reasonCode || "order_rejected_after_capture",
        skipPayoutCheck: true, // checked when the refund was first requested
      });
      summary[r.status] = (summary[r.status] || 0) + 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`[order-refund] retry ${o._id}:`, err.message);
    }
  }
  if (due.length) console.log("[order-refund] retry", JSON.stringify(summary));
  return summary;
}

module.exports = {
  refundPaidMenuOrder,
  retryDueMenuOrderRefunds,
  isRefundableThroughPleis,
  assertRefundablePayoutState,
};
