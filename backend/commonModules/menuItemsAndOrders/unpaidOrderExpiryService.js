/**
 * Expire pay-now menu orders that were never paid.
 *
 * Auto-accept + Pay now orders are created before payment (status pending,
 * hideUntilPaid, lockUntil = place + 10 min) because Monri needs the order id.
 * They stay hidden from staff until paid. When the guest never pays, this job
 * closes them so the reservation voucher they drew is given back:
 *
 *   - no Monri attempt ever started        → expire once lockUntil has passed
 *   - Monri attempt failed / cancelled     → expire once lockUntil has passed
 *   - Monri attempt still pending          → ask Monri first:
 *       captured → fulfil as paid (never expire)
 *       declined → payment-failed path (order cancelled, voucher released)
 *       nothing  → expire only after ATTEMPT_GRACE_MS since the last attempt,
 *                  so a guest still on the 3DS form is not cut off
 *   - Monri attempt already paid           → never expire (left to reconcile)
 *
 * Expired orders keep hideUntilPaid, so staff never see them.
 */
const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const MonriTransaction = require("../paymentsIntegrations/monri/MonriTransaction");
const monriRepository = require("../paymentsIntegrations/monri/monriRepository");
const {
  reconcileOne,
  isMonriBadResponse,
} = require("../paymentsIntegrations/monri/monriReconcileService");
const { emitOrderEvent } = require("@socketIo/orders/orderSocketEmitter");
const { releaseOrderVoucher } = require("./orderVoucherRelease");

// A started Monri attempt gets this long after its last activity before the
// order is expired (3DS and slow banks can take several minutes).
const ATTEMPT_GRACE_MS = 30 * 60 * 1000;
// Orders looked at per run.
const BATCH = 50;
// Monri status queries per run (the lookup host can hang).
const MAX_MONRI_LOOKUPS = 5;
// Stop asking Monri in this run after this many bad responses.
const MAX_MONRI_FAILURES = 2;

const unpaidPayNowFilter = {
  hideUntilPaid: true,
  status: { $in: ["pending", "pendingPayment"] },
  paymentStatus: "pending",
};

async function expireOrder(orderId) {
  const session = await mongoose.startSession();
  let expired = null;
  let voucherReleased = 0;
  try {
    await session.withTransaction(async () => {
      expired = await MenuOrders.findOneAndUpdate(
        { _id: orderId, ...unpaidPayNowFilter },
        { $set: { status: "expired", lockUntil: null } },
        { session, new: true },
      );
      voucherReleased = expired
        ? await releaseOrderVoucher({ order: expired, session })
        : 0;
    });
  } finally {
    session.endSession();
  }
  if (!expired) return null;

  // Close any open Monri attempt so it is not polled again.
  await monriRepository
    .syncMonriTransactionStatus(String(orderId), "cancelled")
    .catch((err) => console.error("[order-expiry] monri sync:", err.message));

  // Guest only: staff never saw this order, so no board event.
  emitOrderEvent({
    io: global.io,
    eventName: "ORDER_UPDATE",
    orderId: expired._id,
    organizationId: null,
    userId: expired.user,
    data: expired,
    updateTypes: ["status", "cancellation"],
  });

  return { voucherReleased };
}

// `match` narrows the scan (scripts / tests); the cron passes nothing.
async function expireUnpaidPayNowOrders({ now = new Date(), match = {} } = {}) {
  const orders = await MenuOrders.find({
    ...match,
    ...unpaidPayNowFilter,
    lockUntil: { $lt: now },
  })
    .select("_id")
    .sort({ lockUntil: 1 })
    .limit(BATCH)
    .lean();

  const summary = {
    scanned: orders.length,
    expired: 0,
    voucherReleased: 0,
    paidAtMonri: 0,
    declinedAtMonri: 0,
    waitingOnAttempt: 0,
    skipped: 0,
    errors: 0,
  };
  let lookups = 0;
  let monriFailures = 0;

  for (const { _id } of orders) {
    const orderNumber = String(_id);
    try {
      const tx = await MonriTransaction.findOne({ orderNumber }).lean();

      if (tx?.status === "paid" || tx?.status === "refunded") {
        // Money is in; the order just has not caught up. Never expire it.
        console.warn(`[order-expiry] ${orderNumber} has a ${tx.status} Monri tx, not expiring`);
        summary.skipped += 1;
        continue;
      }

      if (tx?.status === "pending") {
        if (lookups >= MAX_MONRI_LOOKUPS || monriFailures >= MAX_MONRI_FAILURES) {
          summary.skipped += 1;
          continue;
        }
        lookups += 1;
        let outcome;
        try {
          outcome = await reconcileOne(tx);
          await monriRepository.markReconcileAttempt(orderNumber);
        } catch (err) {
          if (isMonriBadResponse(err)) monriFailures += 1;
          console.error(`[order-expiry] Monri lookup ${orderNumber}:`, err.message);
          summary.skipped += 1;
          continue;
        }
        if (outcome === "fulfilled") {
          summary.paidAtMonri += 1;
          continue;
        }
        if (outcome === "declined") {
          summary.declinedAtMonri += 1;
          continue;
        }
        if (outcome !== "pending") {
          // Amount / currency mismatch or fulfil error: leave it for operations.
          summary.errors += 1;
          continue;
        }
        const lastActivity = new Date(tx.updatedAt || tx.createdAt).getTime();
        if (Date.now() - lastActivity < ATTEMPT_GRACE_MS) {
          summary.waitingOnAttempt += 1;
          continue;
        }
      }

      // No attempt, a failed / cancelled / invalid one, or a pending one
      // Monri has nothing captured for after the grace period.
      const result = await expireOrder(_id);
      if (result) {
        summary.expired += 1;
        summary.voucherReleased += result.voucherReleased;
        console.log(
          `[order-expiry] expired ${orderNumber}` +
            (result.voucherReleased > 0 ? `, voucher released ${result.voucherReleased}` : ""),
        );
      } else {
        summary.skipped += 1; // paid or changed meanwhile
      }
    } catch (err) {
      summary.errors += 1;
      console.error(`[order-expiry] ${orderNumber} failed:`, err.message);
    }
  }

  summary.voucherReleased = Math.round(summary.voucherReleased * 100) / 100;
  if (summary.scanned > 0) {
    console.log("[order-expiry]", JSON.stringify(summary));
  }
  return summary;
}

module.exports = { expireUnpaidPayNowOrders, ATTEMPT_GRACE_MS };
