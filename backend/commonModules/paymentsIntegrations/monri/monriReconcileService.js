/**
 * Bank-style payment settle: Monri is the source of truth, not the app.
 *
 * Typical path: user pays → Monri captures → success URL / webhook marks our DB paid.
 * If the user leaves the app, or our backend is down at that moment, the charge
 * still exists at Monri while our order stays pending.
 *
 * This job later asks Monri "was order_number captured?" and, if approved,
 * runs the same fulfill path as the success URL (idempotent).
 */
const monriRepository = require("./monriRepository");
const { verifyTransaction } = require("./monriService");
const {
  isApprovedMonriResponse,
  isDeclinedMonriResponse,
} = require("./monriSuccessGuard");
const {
  fulfillMonriRedirectPayment,
} = require("../paymentsWebhook/services/paymentWebhookService");

// Wait this long after create / last attempt so the live success URL can win first.
const GRACE_MS = 15 * 60 * 1000; //15 mins
// Stop polling abandoned checkouts older than this.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Cap Monri calls per tick (lookup host can hang).
const BATCH = 5;
// If Monri times out this many times, abort the rest of this scan.
const MAX_LOOKUP_TIMEOUTS = 2;

function isTimeoutError(err) {
  return (
    err?.code === "ECONNABORTED" ||
    err?.code === "ETIMEDOUT" ||
    /timeout/i.test(String(err?.message || ""))
  );
}

function isMonriBadResponse(err) {
  return err?.code === "MONRI_BAD_RESPONSE" || isTimeoutError(err);
}

function amountsMatch(remoteAmount, txAmount) {
  if (remoteAmount == null || remoteAmount === "" || txAmount == null || txAmount === "") {
    return true;
  }
  return String(remoteAmount) === String(txAmount);
}

function currenciesMatch(remoteCurrency, txCurrency) {
  if (!remoteCurrency || !txCurrency) return true;
  return String(remoteCurrency).toUpperCase() === String(txCurrency).toUpperCase();
}

function applyRemoteFields(remote) {
  return {
    rawCallback: remote,
    ...(remote.approval_code && { approvalCode: remote.approval_code }),
    ...(remote.id != null && { monriTransactionId: String(remote.id) }),
  };
}

async function fulfillIfSupported(tx, remote, status) {
  // Subscription / transfer have a different finalizer; only persist Monri status.
  if (tx.orderType === "subscription" || tx.orderType === "tickettransfer") {
    return { handled: true, reason: "status_only" };
  }
  return fulfillMonriRedirectPayment({
    tx,
    payload: remote,
    status,
  });
}

// settleDeclines=false: only an approved capture is acted on (app status
// check). A guest who just backed out must not have the order failed — they
// may still pay it another way; the cron settles real declines later.
async function reconcileOne(tx, { settleDeclines = true } = {}) {
  // Ask Monri. null = no capture yet (user still on form, or abandoned).
  const remote = await verifyTransaction(tx.orderNumber);
  if (!remote) {
    return "pending";
  }

  if (isApprovedMonriResponse(remote)) {
    if (!amountsMatch(remote.amount, tx.amount)) {
      console.error(
        `[payment-reconcile] amount mismatch ${tx.orderNumber}: monri=${remote.amount} local=${tx.amount}`,
      );
      return "error";
    }
    if (!currenciesMatch(remote.currency, tx.currency)) {
      console.error(
        `[payment-reconcile] currency mismatch ${tx.orderNumber}: monri=${remote.currency} local=${tx.currency}`,
      );
      return "error";
    }

    // Same path as /payments/monri/success. Duplicate events are ignored.
    const fulfill = await fulfillIfSupported(tx, remote, "paid");
    if (!fulfill?.handled && fulfill?.reason !== "duplicate event") {
      console.error(
        `[payment-reconcile] fulfill skipped ${tx.orderNumber}:`,
        fulfill?.reason || "unknown",
      );
      return "error";
    }

    await monriRepository.updateTransaction(tx.orderNumber, {
      status: "paid",
      ...applyRemoteFields(remote),
    });
    console.log(`[payment-reconcile] fulfilled ${tx.orderNumber}`);
    return "fulfilled";
  }

  if (isDeclinedMonriResponse(remote)) {
    if (!settleDeclines) return "declined";
    const fulfill = await fulfillIfSupported(tx, remote, "failed").catch((err) => {
      console.error(`[payment-reconcile] decline fulfill ${tx.orderNumber}:`, err.message);
      return { handled: false };
    });
    if (fulfill?.handled || fulfill?.reason === "duplicate event" || fulfill?.reason === "status_only") {
      await monriRepository.updateTransaction(tx.orderNumber, {
        status: "failed",
        ...applyRemoteFields(remote),
      });
    }
    return "declined";
  }

  return "pending";
}

async function reconcilePendingMonriPayments() {
  const pending = await monriRepository.findPendingForReconcile({
    graceMs: GRACE_MS,
    maxAgeMs: MAX_AGE_MS,
    limit: BATCH,
  });

  const summary = {
    scanned: pending.length,
    fulfilled: 0,
    declined: 0,
    pending: 0,
    errors: 0,
    timeouts: 0,
  };

  for (const tx of pending) {
    try {
      const outcome = await reconcileOne(tx);
      // Stamp last attempt so this order is not queried again until GRACE_MS.
      await monriRepository.markReconcileAttempt(tx.orderNumber);
      if (outcome === "fulfilled") summary.fulfilled += 1;
      else if (outcome === "declined") summary.declined += 1;
      else if (outcome === "error") summary.errors += 1;
      else summary.pending += 1;
    } catch (err) {
      await monriRepository.markReconcileAttempt(tx.orderNumber).catch(() => {});
      if (isMonriBadResponse(err)) {
        if (isTimeoutError(err)) summary.timeouts += 1;
        else summary.errors += 1;
        console.error(
          `[payment-reconcile] Monri bad response for ${tx.orderNumber}:`,
          err.message,
        );
        if (summary.timeouts + summary.errors >= MAX_LOOKUP_TIMEOUTS) {
          console.warn(
            "[payment-reconcile] 2 Monri failures — stopping this scan so cron can restart",
          );
          break;
        }
        continue;
      }
      summary.errors += 1;
      console.error(`[payment-reconcile] ${tx.orderNumber} failed:`, err.message);
    }
  }

  console.log("[payment-reconcile]", JSON.stringify(summary));
  return summary;
}

async function reconcileOrderNumber(orderNumber) {
  const tx = await monriRepository.findByOrderNumber(orderNumber);
  if (!tx) {
    console.log(`[payment-reconcile] no local MonriTransaction for ${orderNumber}`);
    return { outcome: "missing_local" };
  }
  const plain = typeof tx.toObject === "function" ? tx.toObject() : tx;
  console.log(
    "[payment-reconcile] local row:",
    JSON.stringify({
      orderNumber: plain.orderNumber,
      status: plain.status,
      amount: plain.amount,
      orderType: plain.orderType,
    }),
  );
  const outcome = await reconcileOne(plain);
  console.log(`[payment-reconcile] ${orderNumber} outcome=${outcome}`);
  return { outcome, localStatus: plain.status };
}

// One app status check per order per window, so repeated back presses
// don't hammer Monri. Per instance; good enough as a brake.
const STATUS_CHECK_COOLDOWN_MS = 5000;
const lastStatusCheck = new Map();

/**
 * The guest left the payment WebView without our success/cancel redirect
 * (e.g. back button after Apple Pay). Ask Monri now instead of waiting for
 * the 15-minute cron; an approved capture is fulfilled through the same path.
 * Returns the MonriTransaction status: "paid" | "pending" | "failed" | ...
 */
async function checkPaymentStatusNow(tx) {
  if (tx.status !== "pending") return tx.status;

  const now = Date.now();
  const last = lastStatusCheck.get(tx.orderNumber) || 0;
  if (now - last < STATUS_CHECK_COOLDOWN_MS) return "pending";
  lastStatusCheck.set(tx.orderNumber, now);
  if (lastStatusCheck.size > 1000) {
    for (const [key, at] of lastStatusCheck) {
      if (now - at > STATUS_CHECK_COOLDOWN_MS) lastStatusCheck.delete(key);
    }
  }

  try {
    const outcome = await reconcileOne(tx, { settleDeclines: false });
    console.log(`[payment-status] ${tx.orderNumber} outcome=${outcome}`);
    return outcome === "fulfilled" ? "paid" : "pending";
  } catch (err) {
    // Monri unreachable: report pending; the cron keeps trying.
    console.error(`[payment-status] ${tx.orderNumber} check failed:`, err.message);
    return "pending";
  }
}

module.exports = {
  checkPaymentStatusNow,
  reconcilePendingMonriPayments,
  reconcileOrderNumber,
  reconcileOne,
  isMonriBadResponse,
};
