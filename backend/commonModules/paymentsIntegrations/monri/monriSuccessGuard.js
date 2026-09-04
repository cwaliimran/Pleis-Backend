const crypto = require("crypto");

function isApprovedMonriResponse(payload = {}) {
  return (
    payload.response_code === "0000" ||
    payload.response_code === "000" ||
    payload.status === "approved"
  );
}

function isDeclinedMonriResponse(payload = {}) {
  if (isApprovedMonriResponse(payload)) return false;
  if (payload.status === "declined" || payload.status === "denied" || payload.status === "failed") {
    return true;
  }
  return Boolean(payload.response_code);
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * Monri hashes the raw success URL as received, without the digest param.
 * Do not rebuild from decoded query keys — `+` vs `%20` would fail.
 */
function getRawSuccessUrlWithoutDigest(req, successUrl) {
  const base = String(successUrl || "").split("?")[0];
  const original = String(req?.originalUrl || req?.url || "");
  const query = original.includes("?") ? original.slice(original.indexOf("?") + 1) : "";
  const withoutDigest = query
    .split("&")
    .filter((part) => part && !part.toLowerCase().startsWith("digest="))
    .join("&");
  return withoutDigest ? `${base}?${withoutDigest}` : base;
}

function verifyMonriSuccessDigest({ req, payload, successUrl, merchantKey }) {
  const digest = payload?.digest;
  const key = merchantKey || process.env.MONRI_KEY;
  if (!digest || !successUrl || !key) return false;

  const urlWithoutDigest = getRawSuccessUrlWithoutDigest(req, successUrl);
  const expected = crypto
    .createHash("sha512")
    .update(`${key}${urlWithoutDigest}`)
    .digest("hex");

  return timingSafeEqualHex(expected, String(digest));
}

function amountsMatch(payloadAmount, txAmount) {
  if (payloadAmount == null || payloadAmount === "" || txAmount == null || txAmount === "") {
    return true;
  }
  return String(payloadAmount) === String(txAmount);
}

/**
 * Decide what /success may do. Never mark paid without a valid digest.
 * Never mark failed just because the WebView opened SUCCESS_URL?order_number=.
 */
function evaluateMonriSuccessIntent({
  req,
  payload = {},
  tx,
  successUrl,
  merchantKey,
}) {
  if (!tx) {
    return { action: "reject", httpStatus: 404, reason: "transaction_not_found" };
  }

  const hasDigest = Boolean(payload.digest);
  const digestValid =
    hasDigest &&
    verifyMonriSuccessDigest({ req, payload, successUrl, merchantKey });

  if (tx.status === "paid") {
    return { action: "fulfill_paid", reason: "already_paid" };
  }

  if (tx.status === "refunded") {
    return { action: "ignore", httpStatus: 200, reason: "already_refunded" };
  }

  if (hasDigest && !digestValid) {
    return { action: "reject", httpStatus: 400, reason: "invalid_digest" };
  }

  if (isApprovedMonriResponse(payload)) {
    if (!hasDigest) {
      return { action: "reject", httpStatus: 400, reason: "digest_required" };
    }
    if (!amountsMatch(payload.amount, tx.amount)) {
      return { action: "reject", httpStatus: 400, reason: "amount_mismatch" };
    }
    return { action: "fulfill_paid", reason: "approved" };
  }

  if (isDeclinedMonriResponse(payload)) {
    if (!hasDigest) {
      return { action: "ignore", httpStatus: 200, reason: "unverified_decline" };
    }
    return { action: "fulfill_failed", reason: "declined" };
  }

  return { action: "ignore", httpStatus: 200, reason: "incomplete_callback" };
}

function buildDummyMonriSuccessRequest({
  successUrl,
  merchantKey,
  params,
}) {
  const base = String(successUrl || "").split("?")[0];
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null) search.append(key, String(value));
  });
  const urlWithoutDigest = `${base}?${search.toString()}`;
  const digest = crypto
    .createHash("sha512")
    .update(`${merchantKey}${urlWithoutDigest}`)
    .digest("hex");
  const originalPath = new URL(urlWithoutDigest).pathname;
  const originalUrl = `${originalPath}?${search.toString()}&digest=${digest}`;
  return {
    urlWithoutDigest,
    digest,
    originalUrl,
    req: { originalUrl, url: originalUrl, query: Object.fromEntries(search) },
    payload: { ...Object.fromEntries(search), digest },
  };
}

module.exports = {
  isApprovedMonriResponse,
  isDeclinedMonriResponse,
  getRawSuccessUrlWithoutDigest,
  verifyMonriSuccessDigest,
  evaluateMonriSuccessIntent,
  buildDummyMonriSuccessRequest,
};
