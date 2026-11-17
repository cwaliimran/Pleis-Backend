const axios = require("axios");
const crypto = require("crypto");
const {
  getMonriBaseUrl,
  getMonriAuthToken,
  getMonriKey,
} = require("./monriEnv");
const { parseMonriOrderXml, escapeXml } = require("./monriService");

function isLiveRefundEnabled() {
  return process.env.MONRI_LIVE_REFUND_ENABLED === "true";
}

function nextRefundStatus({ originalAmount, alreadyRefunded = 0, thisRefundAmount }) {
  const original = Number(originalAmount) || 0;
  const prior = Number(alreadyRefunded) || 0;
  const next = Number(thisRefundAmount) || 0;
  const total = prior + next;
  if (total + 0.0001 < original) return "paid";
  return "refunded";
}

/**
 * Monri transaction management (WebPay): refund a captured purchase.
 * POST {base}/transactions/{order_number}/refund.xml, application/xml,
 * digest = SHA1(key + order_number + amount + currency), amount in minor units.
 * Approved only when the reply's status is "approved" (the HTTP code is not relied on).
 *
 * Returns { outcome: "approved" | "declined", response } on a definite answer.
 * Throws with code MONRI_REFUND_UNKNOWN when the answer is unknown (timeout,
 * 5xx, Cloudflare 52x): the refund must then not be retried blind (§6.9).
 */
async function refundViaMonri({ orderNumber, amountCents, currency = "EUR" }) {
  const amount = String(Math.round(Number(amountCents)));
  const digest = crypto
    .createHash("sha1")
    .update(getMonriKey() + orderNumber + amount + currency)
    .digest("hex");
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<transaction>" +
    `<amount>${amount}</amount>` +
    `<currency>${escapeXml(currency)}</currency>` +
    `<digest>${digest}</digest>` +
    `<authenticity-token>${escapeXml(getMonriAuthToken())}</authenticity-token>` +
    `<order-number>${escapeXml(orderNumber)}</order-number>` +
    "</transaction>";

  // Cloudflare 521/522/523: the request never reached Monri (origin down /
  // TCP handshake timeout / unreachable), so nothing was refunded and a retry
  // is safe. 524 (origin timed out after connecting) and no reply are unknown.
  const NOT_DELIVERED = new Set([521, 522, 523]);
  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      response = await axios.post(
        `${getMonriBaseUrl()}/transactions/${encodeURIComponent(orderNumber)}/refund.xml`,
        xml,
        {
          headers: { "Content-Type": "application/xml", Accept: "application/xml" },
          timeout: 30000,
          responseType: "text",
          validateStatus: () => true,
        },
      );
    } catch (err) {
      const unknown = new Error(`monri_refund_no_answer: ${err.message}`);
      unknown.code = "MONRI_REFUND_UNKNOWN";
      throw unknown;
    }
    if (!NOT_DELIVERED.has(response.status)) break;
    console.warn(`[monri-refund] ${orderNumber} not delivered (HTTP ${response.status}), try ${attempt}/3`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  if (NOT_DELIVERED.has(response.status)) {
    const notDelivered = new Error(`monri_refund_not_delivered: HTTP ${response.status}`);
    notDelivered.code = "MONRI_REFUND_NOT_DELIVERED";
    throw notDelivered;
  }

  const parsed = parseMonriOrderXml(response.data);
  // Card data never stored: keep only the fields the refund record needs.
  const summary = {
    httpStatus: response.status,
    status: parsed.status ?? null,
    response_code: parsed.response_code ?? null,
    response_message: parsed.response_message ?? null,
    transaction_type: parsed.transaction_type ?? null,
    amount: parsed.amount ?? null,
    id: parsed.id ?? null,
    error: parsed.error ?? null,
  };
  console.log("[monri-refund]", JSON.stringify({ orderNumber, ...summary }));

  if (summary.status === "approved") return { outcome: "approved", response: summary };
  // A definite "no": status decline / invalid, or a 4xx with an error document
  // (406 Not Acceptable, 422 "Invalid order_number", …). Only 5xx / Cloudflare
  // 52x / no reply leave the outcome unknown.
  const definiteHttpNo = response.status >= 400 && response.status < 500;
  if (definiteHttpNo || ["decline", "declined", "invalid"].includes(summary.status)) {
    return { outcome: "declined", response: summary };
  }
  const unknown = new Error(`monri_refund_unknown_answer: HTTP ${response.status}`);
  unknown.code = "MONRI_REFUND_UNKNOWN";
  unknown.response = summary;
  throw unknown;
}

function planMonriRefund({ tx, amount }) {
  const refundAmount = amount == null ? tx?.amount : Number(amount);
  // Refundable: a captured attempt (status paid, or a Monri id from a capture).
  const captured =
    tx && (tx.status === "paid" || (tx.status == null && tx.monriTransactionId));
  if (!captured) {
    return { ok: false, error: "transaction_not_refundable" };
  }
  if (!(refundAmount > 0)) {
    return { ok: false, error: "invalid_refund_amount" };
  }
  const already = Number(tx.refundedAmount) || 0;
  if (already + refundAmount > Number(tx.amount) + 0.0001) {
    return { ok: false, error: "refund_exceeds_original" };
  }
  return {
    ok: true,
    refundAmount,
    nextStatus: nextRefundStatus({
      originalAmount: tx.amount,
      alreadyRefunded: already,
      thisRefundAmount: refundAmount,
    }),
    nextRefundedAmount: already + refundAmount,
  };
}

module.exports = {
  isLiveRefundEnabled,
  nextRefundStatus,
  refundViaMonri,
  planMonriRefund,
};
