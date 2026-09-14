const axios = require("axios");
const { getMonriBaseUrl, getMonriAuthToken } = require("./monriEnv");

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

async function refundViaMonri({ transactionId, amount, currency }) {
  const payload = {
    transaction_type: "refund",
    transaction_id: transactionId,
    amount,
    currency,
  };

  const response = await axios.post(
    `${getMonriBaseUrl()}/v2/payment/refund`,
    payload,
    {
      headers: {
        Authorization: `key-${getMonriAuthToken()}`,
        "Content-Type": "application/json",
      },
    },
  );

  return response.data;
}

function planMonriRefund({ tx, amount }) {
  const refundAmount = amount == null ? tx.amount : Number(amount);
  if (!tx?.monriTransactionId) {
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
