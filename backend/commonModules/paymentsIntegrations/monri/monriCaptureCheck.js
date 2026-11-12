/**
 * Server-side capture check (#10, #25; Monri v1.4 §3.2).
 *
 * Payment state changes only from a verified callback, a verified webhook or a
 * server-side status query — never from the client returning to the app. Any
 * path that a client can reach (the success redirect, the app's "paid" post)
 * asks Monri for the order's status first and goes ahead only on `approved`
 * with the stored amount.
 *
 * persist: true marks the stored Monri attempt paid with Monri's response.
 */
const monriRepository = require("./monriRepository");
const { verifyTransaction } = require("./monriService");
const { isApprovedMonriResponse } = require("./monriSuccessGuard");

async function confirmMonriCapture(orderNumber, { persist = true } = {}) {
  const tx = await monriRepository.findByOrderNumber(orderNumber);
  if (!tx) return { confirmed: false, reason: "monri_transaction_not_found" };
  if (tx.status === "paid") return { confirmed: true, amount: tx.amount };

  let remote = null;
  try {
    remote = await verifyTransaction(orderNumber);
  } catch (err) {
    console.error(`[monri-capture] capture check failed for ${orderNumber}:`, err.message);
    return { confirmed: false, reason: "capture_check_unavailable" };
  }
  if (!remote || !isApprovedMonriResponse(remote)) {
    return { confirmed: false, reason: "capture_not_confirmed" };
  }
  if (remote.amount != null && tx.amount != null && String(remote.amount) !== String(tx.amount)) {
    console.error(`[monri-capture] amount mismatch ${orderNumber}: monri=${remote.amount} local=${tx.amount}`);
    return { confirmed: false, reason: "amount_mismatch" };
  }
  if (persist) {
    await monriRepository.updateTransaction(orderNumber, {
      status: "paid",
      rawCallback: remote,
      ...(remote.approval_code && { approvalCode: remote.approval_code }),
      ...(remote.id != null && { monriTransactionId: String(remote.id) }),
    });
  }
  return { confirmed: true, amount: tx.amount, remote };
}

module.exports = { confirmMonriCapture };
