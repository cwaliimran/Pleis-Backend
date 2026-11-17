/**
 * Profile > Payment methods > Add card (Monri Integration v1.4 §5.1, "Save
 * from Profile"; Requirement Set v13.8 #135).
 *
 *   1. App      POST /cards/add-session            → { page_url }
 *   2. Backend  POST {base}/v2/payment/new, scenario add_payment_method:
 *               Monri authenticates the card with 3-D Secure, tokenizes it
 *               and voids the amount itself, so no money is taken.
 *   3. WebView  GET  /cards/add-page/:attemptId?t= → Monri card component
 *   4. Page     POST /cards/add-complete/:attemptId with the Monri result
 *   5. Page     → /cards/add-result?status=saved|failed (the app closes on it)
 *
 * The result reaches Pleis from the page, so it is accepted only for an
 * attempt this guest started, with its single-use page token, within
 * ATTEMPT_TTL_MS, and the card lands on that guest's own account. A token
 * that is not genuine cannot be paid with: Monri refuses it on the payment
 * form and the card is marked expired (§5.1 edge case).
 */
const crypto = require("crypto");
const axios = require("axios");
const mongoose = require("mongoose");
const CardSaveAttempt = require("../repositories/CardSaveAttempt.model");
const userCardRepository = require("../repositories/userCardRepository");
const { MAX_SAVED_CARDS, saveCardFromMonriPayment } = require("./userCardService");
const { buildAuthorizationHeader } = require("../../monri/monriAuth");
const {
  getMonriBaseUrl,
  getMonriAuthToken,
  getMonriComponentsEnv,
  getMonriCurrency,
  getMonriCountry,
  isMonriTokenizationEnabled,
} = require("../../monri/monriEnv");
const { UserBillingInformation } = require("../../../transactions/UserBillingInformation");

const ATTEMPT_TTL_MS = 30 * 60 * 1000;
// Amount Monri authorizes for the check and then voids (minor units).
const VERIFY_AMOUNT_CENTS = 100;
const NOT_DELIVERED = new Set([521, 522, 523]);

const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

function sameHash(a, b) {
  const x = Buffer.from(String(a || ""), "hex");
  const y = Buffer.from(String(b || ""), "hex");
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** JSON for an inline <script>: no "</script>" break-out. */
const jsLiteral = (value) => JSON.stringify(value ?? null).replace(/</g, "\\u003c");

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

async function createAddPaymentMethodSession(orderNumber) {
  const body = JSON.stringify({
    amount: VERIFY_AMOUNT_CENTS,
    currency: getMonriCurrency(),
    order_number: orderNumber,
    order_info: "Save card",
    transaction_type: "authorize",
    scenario: "add_payment_method",
  });
  let response;
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await axios.post(`${getMonriBaseUrl()}/v2/payment/new`, body, {
      headers: {
        Authorization: buildAuthorizationHeader({ body }),
        "Content-Type": "application/json",
      },
      timeout: 20000,
      validateStatus: () => true,
    });
    if (!NOT_DELIVERED.has(response.status)) break;
    console.warn(`[add-card] Monri not reached (HTTP ${response.status}), try ${attempt}/3`);
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  const data = response?.data || {};
  if (response?.status === 200 && data.client_secret) return data.client_secret;

  const message = String(data.message || "");
  if (message.includes("tokenization has been requested")) {
    throw httpError(409, "card_saving_unavailable");
  }
  console.error("[add-card] Monri session refused:", response?.status, message || data);
  throw httpError(502, "card_save_start_failed");
}

/** Step 1: the guest tapped Add card. Returns the hosted page URL. */
async function startAddCard({ userId, pageBaseUrl }) {
  if (!isMonriTokenizationEnabled()) throw httpError(409, "card_saving_unavailable");
  if ((await userCardRepository.countUserCards(userId)) >= MAX_SAVED_CARDS) {
    throw httpError(409, "max_saved_cards");
  }

  // Monri order_number: letters and digits, unique per attempt.
  const orderNumber = `card${new mongoose.Types.ObjectId().toString()}`;
  const clientSecret = await createAddPaymentMethodSession(orderNumber);
  const pageToken = crypto.randomBytes(32).toString("hex");

  const attempt = await CardSaveAttempt.create({
    user: userId,
    orderNumber,
    pageTokenHash: hashToken(pageToken),
    clientSecret,
    expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
  });
  return {
    page_url: `${pageBaseUrl}/add-page/${attempt._id}?t=${pageToken}`,
    attemptId: String(attempt._id),
  };
}

/** The attempt for a page token, or null when the link is wrong. */
async function findAttempt(attemptId, pageToken) {
  if (!mongoose.Types.ObjectId.isValid(String(attemptId)) || !pageToken) return null;
  const attempt = await CardSaveAttempt.findById(attemptId).select("+pageTokenHash +clientSecret");
  if (!attempt || !sameHash(attempt.pageTokenHash, hashToken(pageToken))) return null;
  return attempt;
}

/** Step 3: the page with Monri's card component (3-D Secure runs inside it). */
async function renderAddCardPage({ attemptId, pageToken, pageBaseUrl }) {
  const attempt = await findAttempt(attemptId, pageToken);
  if (!attempt || attempt.status !== "pending" || attempt.expiresAt < new Date()) {
    return { status: 410, html: resultHtml("failed") };
  }

  const billing = await UserBillingInformation.findOne({ user: attempt.user })
    .populate("user", "firstName lastName email username")
    .lean();
  const User = mongoose.model("User");
  const user = await User.findById(attempt.user).select("firstName lastName email username").lean();
  const address = billing?.billingAddress || {};
  const params = {
    fullName:
      `${billing?.user?.firstName || ""} ${billing?.user?.lastName || ""}`.trim() ||
      `${user?.firstName || ""} ${user?.lastName || ""}`.trim() ||
      user?.username ||
      "Pleis guest",
    email: billing?.email || user?.email || "",
    address: address.address || "",
    city: address.city || "",
    zip: address.postalCode || "",
    phone: billing?.phone || "",
    country: address.country === "USA" ? "US" : address.country || getMonriCountry(),
    orderInfo: "Save card",
  };

  // Own policy for this page (the app-wide one allows no inline script and no
  // frames): our script by nonce, Monri's script, its card iframe and calls.
  // frame-src https: because 3-D Secure may show the bank's own page.
  const nonce = crypto.randomBytes(16).toString("base64");
  const monriOrigin = new URL(getMonriBaseUrl()).origin;
  const csp = [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' ${monriOrigin}`,
    `frame-src ${monriOrigin} https:`,
    `connect-src 'self' ${monriOrigin}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "form-action 'self' https:",
  ].join("; ");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Add card</title>
<script nonce="${nonce}" src="${escapeHtml(getMonriBaseUrl())}/dist/components.js"></script>
<style>
  body { font-family: -apple-system, Roboto, sans-serif; margin: 0; padding: 20px; color: #111; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 6px; }
  p { font-size: 14px; color: #555; line-height: 1.45; margin: 0 0 18px; }
  #card { margin-bottom: 18px; }
  button { width: 100%; padding: 14px; font-size: 16px; border: 0; border-radius: 10px; background: #111; color: #fff; }
  button:disabled { opacity: .5; }
  #error { color: #b00020; font-size: 14px; margin-top: 12px; min-height: 18px; }
</style>
</head>
<body>
<h1>Add card</h1>
<p>Your card is checked with your bank and saved by Monri for your future payments in Pleis. No money is taken. Pleis keeps only the card type, the last four digits and the expiry date, and you are always asked to confirm a payment.</p>
<div id="card"></div>
<button id="save">Save card</button>
<div id="error"></div>
<script nonce="${nonce}">
(function () {
  var params = ${jsLiteral(params)};
  var completeUrl = ${jsLiteral(`${pageBaseUrl}/add-complete/${attempt._id}`)};
  var resultUrl = ${jsLiteral(`${pageBaseUrl}/add-result`)};
  var pageToken = ${jsLiteral(pageToken)};
  var monri = Monri(${jsLiteral(getMonriAuthToken())}, { environment: ${jsLiteral(getMonriComponentsEnv())} });
  var components = monri.components({ clientSecret: ${jsLiteral(attempt.clientSecret)} });
  var card = components.create("card", { tokenizePan: true });
  card.mount("card");

  var button = document.getElementById("save");
  var errorBox = document.getElementById("error");
  function finish(status, code) {
    window.location.href = resultUrl + "?status=" + encodeURIComponent(status) + "&code=" + encodeURIComponent(code || "");
  }
  button.onclick = function () {
    button.disabled = true;
    errorBox.textContent = "";
    monri.confirmPayment(card, params).then(function (res) {
      if (res.error) {
        errorBox.textContent = res.error.message || "The card could not be checked.";
        button.disabled = false;
        return;
      }
      var r = res.result || {};
      return fetch(completeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          t: pageToken,
          result: {
            status: r.status,
            order_number: r.order_number,
            pan_token: r.pan_token,
            payment_method: r.payment_method || null
          }
        })
      }).then(function (resp) { return resp.json(); })
        .then(function (data) { finish(data.status || "failed", data.code); });
    }).catch(function () {
      errorBox.textContent = "Something went wrong. Please try again.";
      button.disabled = false;
    });
  };
})();
</script>
</body>
</html>`;
  return { status: 200, html, csp };
}

async function closeAttempt(attempt, status, error = null, cardId = null) {
  await CardSaveAttempt.updateOne(
    { _id: attempt._id, status: "pending" },
    { $set: { status, error, cardId, completedAt: new Date() } },
  );
  return { status, code: error };
}

/** Step 4: the Monri result from the page. Returns { status, code }. */
async function completeAddCard({ attemptId, pageToken, result }) {
  const attempt = await findAttempt(attemptId, pageToken);
  if (!attempt) throw httpError(404, "card_save_session_invalid");
  if (attempt.status !== "pending") return { status: attempt.status, code: attempt.error };
  if (attempt.expiresAt < new Date()) return closeAttempt(attempt, "failed", "card_save_session_expired");

  const r = result || {};
  if (r.order_number && String(r.order_number) !== attempt.orderNumber) {
    return closeAttempt(attempt, "failed", "card_save_session_invalid");
  }
  if (String(r.status || "").toLowerCase() !== "approved") {
    return closeAttempt(attempt, "failed", "card_save_declined");
  }
  const data = r.payment_method?.data || {};
  const panToken = r.pan_token || data.token;
  const maskedPan = data.masked;
  if (!panToken || !maskedPan) return closeAttempt(attempt, "failed", "card_not_tokenized");

  const card = await saveCardFromMonriPayment({
    userId: attempt.user,
    panToken,
    maskedPan,
    ccType: data.brand,
    orderNumber: attempt.orderNumber,
    expirationDate: data.expiration_date,
    createdVia: "profile",
  });
  if (!card) return closeAttempt(attempt, "failed", "max_saved_cards");
  console.log(`[add-card] user ${attempt.user} saved card ${card._id} (${card.brand} ${card.last4})`);
  return closeAttempt(attempt, "saved", null, card._id);
}

/** Step 5: what the WebView lands on; the app closes on this URL. */
function resultHtml(status) {
  const saved = status === "saved";
  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Add card</title></head>
<body style="font-family:-apple-system,Roboto,sans-serif;padding:24px;text-align:center">
<p>${saved ? "Card saved." : "The card was not saved."}</p></body></html>`;
}

module.exports = {
  ATTEMPT_TTL_MS,
  startAddCard,
  renderAddCardPage,
  completeAddCard,
  resultHtml,
};
