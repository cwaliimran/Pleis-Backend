const crypto = require("crypto");
const axios = require("axios");
const { buildAuthorizationHeader } = require("./monriAuth");
const { sendResponse } = require("../../../helperUtils/responseUtil");

const monriRepository = require("./monriRepository");
const { confirmMonriCapture } = require("./monriCaptureCheck");
const { verifyTransaction, createTransactionMonriOrder } = require("./monriService");
const { checkPaymentStatusNow } = require("./monriReconcileService");
const { UserBillingInformation } = require("../../transactions/UserBillingInformation");
const { SubscriptionTypes } = require("../../../models/UserModel");
const {
  assertOrganizerBillkoReady,
} = require("../billko/billkoCredentials");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
const mongoose = require("mongoose");
const {
  fulfillMonriRedirectPayment,
} = require("../paymentsWebhook/services/paymentWebhookService");
const {
  evaluateMonriSuccessIntent,
} = require("./monriSuccessGuard");
const {
  isLiveRefundEnabled,
  refundViaMonri,
  planMonriRefund,
} = require("./refundService");
const {
  getCardTokenForPayment,
  canSaveMoreCards,
  saveCardFromMonriPayment,
} = require("../usersPaymentsCards/services/userCardService");
const { touchCard, markCardExpired } = require("../usersPaymentsCards/repositories/userCardRepository");
const {
  isMonriTokenizationEnabled,
  getMonriBaseUrl,
  getMonriKey,
  getMonriAuthToken,
  getMonriSuccessUrl,
  getMonriCancelUrl,
  getMonriCurrency,
  getMonriLanguage,
  getMonriCountry,
  getMonriLocale,
  getMonriComponentsEnv,
} = require("./monriEnv");

const PAID_SUBSCRIPTION_TYPES = Object.values(SubscriptionTypes).filter(
  (type) => type !== SubscriptionTypes.FREE
);

function getMonriCallbackPayload(req) {
  // GET redirect → query; merchant callback → JSON body; form POST → body
  return {
    ...(req.query || {}),
    ...(req.body && typeof req.body === "object" ? req.body : {}),
  };
}

function normalizeDbPaymentMethod(paymentMethod) {
  if (paymentMethod === "apple-pay") return "applePay";
  if (paymentMethod === "google-pay") return "googlePay";
  return "card";
}

/** Euro amount → integer cents, safe for values like 3.675 (= 367.4999… in floating point). */
const toCents = (value) => Math.round(Number((Number(value || 0) * 100).toFixed(6)));

/**
 * Monri v1.4 §3.1–3.2: the server is the only source of the amount. The order's
 * total is computed by the backend when the order is placed; the amount the app
 * sends for the payment link must equal that stored total, in cents, or no
 * payment is created. Returns the verified amount in cents.
 */
async function assertAmountMatchesOrder(orderType, orderNumber, amountCents, userId) {
  const fail = (code, statusCode = 400) => {
    const err = new Error(code);
    err.code = "PAYMENT_AMOUNT_CHECK";
    err.statusCode = statusCode;
    throw err;
  };
  if (!mongoose.Types.ObjectId.isValid(String(orderNumber))) fail("order_not_found", 404);

  let expected;
  let owner;
  let alreadyPaid = false;
  if (orderType === "menuorders") {
    const order = await MenuOrders.findById(orderNumber).select("totalPrice user paymentStatus status").lean();
    if (!order) fail("order_not_found", 404);
    expected = order.totalPrice;
    owner = order.user;
    alreadyPaid = order.paymentStatus === "paid";
    // Expired (unpaid pay-now window), cancelled or rejected orders take no new payment.
    if (!alreadyPaid && ["expired", "cancelled", "rejected"].includes(order.status)) {
      if (userId && owner && String(owner) !== String(userId)) fail("order_not_found", 404);
      fail("order_not_payable", 409);
    }
  } else if (orderType === "ticketingbookings") {
    const order = await TicketingOrders.findById(orderNumber).select("orderPricing user paymentDetails.paymentStatus").lean();
    if (!order) fail("order_not_found", 404);
    expected = order.orderPricing?.total;
    owner = order.user;
    alreadyPaid = order.paymentDetails?.paymentStatus === "paid";
  } else if (orderType === "userreservations") {
    const reservation = await UserReservations.findById(orderNumber)
      .select("amount priceBreakDown userId paymentDetails.paymentStatus")
      .lean();
    if (!reservation) fail("order_not_found", 404);
    // amount = reservation after promo + pre-ordered menu items, paid together (reservationRepository).
    expected = reservation.amount ?? reservation.priceBreakDown?.reservationFinalAmount;
    owner = reservation.userId;
    alreadyPaid = reservation.paymentDetails?.paymentStatus === "paid";
  } else {
    // combinedBooking / tickettransfer: no stored total wired yet — logged, see HANDOFF.md.
    console.warn(`[monri] amount not verified for orderType=${orderType} orderNumber=${orderNumber}`);
    return amountCents;
  }

  if (userId && owner && String(owner) !== String(userId)) fail("order_not_found", 404);
  if (alreadyPaid) fail("order_already_paid", 409);
  if (toCents(expected) !== Number(amountCents)) {
    console.warn(
      `[monri] amount mismatch ${orderType} ${orderNumber}: sent=${amountCents} stored=${toCents(expected)}`,
    );
    fail("payment_amount_mismatch", 409);
  }
  return toCents(expected);
}

async function assertBillkoReadyForMonriOrder(orderType, orderNumber) {
  if (!orderNumber) return;
  let companyOrganizerId;
  if (orderType === "menuorders") {
    const order = await MenuOrders.findById(orderNumber)
      .select("companyOrganizer")
      .lean();
    companyOrganizerId = order?.companyOrganizer;
  } else if (orderType === "ticketingbookings") {
    const order = await TicketingOrders.findById(orderNumber)
      .select("companyOrganizer")
      .lean();
    companyOrganizerId = order?.companyOrganizer;
  } else if (orderType === "userreservations") {
    const reservation = await UserReservations.findById(orderNumber)
      .select("companyOrganizer")
      .lean();
    companyOrganizerId = reservation?.companyOrganizer;
  }
  if (companyOrganizerId) {
    await assertOrganizerBillkoReady(companyOrganizerId);
  }
}

/**
 * digest = SHA512(key + order_number + amount + currency)
 */
function generateDigest({ orderNumber, amount, currency }) {
  const raw = `${getMonriKey()}${orderNumber}${amount}${currency}`;
  return crypto.createHash("sha512").update(raw).digest("hex");
}

const MONRI_FORM_SKIP_KEYS = new Set([
  "clientSecret",
  "trx_token",
  "locale",
  "environment",
  "payment_url",
  "form_action",
]);

function isRetryableMonriFormError(err) {
  return (
    err?.code === "ENOTFOUND" ||
    err?.code === "EAI_AGAIN" ||
    err?.code === "ECONNRESET" ||
    err?.code === "ETIMEDOUT" ||
    err?.code === "ECONNABORTED" ||
    err?.code === "ECONNREFUSED" ||
    // Monri / Cloudflare 5xx (e.g. 522 origin timeout): try again.
    Number(err?.details?.status || err?.httpStatus) >= 500
  );
}

/**
 * Apple Pay / Google Pay: open a Monri payment (client_secret + trx_token).
 * Same 3 tries as the card form: Monri's host randomly answers Cloudflare 522.
 * The Authorization header holds a timestamp, so it is rebuilt for every try.
 */
async function createMonriWalletPayment(payload) {
  const body = JSON.stringify(payload);
  const maxTries = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const response = await axios.post(`${getMonriBaseUrl()}/v2/payment/new`, body, {
        headers: {
          Authorization: buildAuthorizationHeader({ body }),
          "Content-Type": "application/json",
        },
        timeout: 20000,
        family: 4,
      });
      if (response.data?.client_secret) return response.data;
      lastError = new Error("monri_form_failed");
      lastError.details = response.data || { status: response.status };
    } catch (err) {
      lastError = err;
      if (err?.response?.status) lastError.httpStatus = err.response.status;
    }

    console.warn(
      `[monri-wallet] try ${attempt}/${maxTries} failed:`,
      lastError?.code || lastError?.message,
      lastError?.httpStatus || "",
    );
    if (attempt < maxTries && isRetryableMonriFormError(lastError)) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      continue;
    }
    break;
  }

  // 502 → "failed_to_open_monri_card_form" in the session handlers.
  const error = new Error("monri_form_failed");
  error.statusCode = 502;
  error.cause = lastError;
  throw error;
}

async function createMonriCardPaymentUrl(sessionFields) {
  const body = new URLSearchParams();
  Object.entries(sessionFields).forEach(([key, value]) => {
    if (MONRI_FORM_SKIP_KEYS.has(key) || value === undefined || value === null) {
      return;
    }
    body.append(key, String(value));
  });

  const maxTries = 3;
  let lastError;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const response = await axios.post(
        `${getMonriBaseUrl()}/v2/form`,
        body.toString(),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          timeout: 20000,
          family: 4,
          validateStatus: () => true,
        },
      );

      if (response.data?.payment_url) {
        return response.data.payment_url;
      }

      lastError = new Error("monri_form_failed");
      lastError.statusCode = 502;
      lastError.httpStatus = response.status;
      lastError.details = response.data || { status: response.status };
    } catch (err) {
      lastError = err;
    }

    console.warn(
      `[monri-form] try ${attempt}/${maxTries} failed:`,
      lastError?.code || lastError?.message,
      lastError?.details || "",
    );
    if (attempt < maxTries && isRetryableMonriFormError(lastError)) {
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      continue;
    }
    break;
  }

  const error = lastError || new Error("monri_form_failed");
  error.statusCode = error.statusCode || 502;
  throw error;
}


exports.redirectToMonriWebPay = async (req, res) => {
  try {
    // --- REQUIRED PAYMENT DATA ---

    const currency = getMonriCurrency();
    const { amount, orderType, orderNumber } = req.query

    // --- PERSIST TRANSACTION (so we can track it) ---
    await monriRepository.createTransaction({
      orderNumber: orderNumber,
      amount,
      currency,
      orderType,
      status: "pending",
    });

    const digest = generateDigest({
      orderNumber,
      amount,
      currency,
    });

    // --- RENDER AUTO-SUBMIT FORM ---
    res.send(`
<!DOCTYPE html>
<html>
  <head>
    <title>Redirecting to payment...</title>
  </head>
  <body onload="document.forms[0].submit()">
    <p>Redirecting to secure payment...</p>

    <form method="POST" action="${getMonriBaseUrl()}/v2/form">
      <input type="hidden" name="authenticity_token" value="${getMonriAuthToken()}" />
      <input type="hidden" name="transaction_type" value="purchase" />

      <input type="hidden" name="order_number" value="${orderNumber}" />
      <input type="hidden" name="order_info" value="Test payment" />

      <input type="hidden" name="amount" value="${amount}" />
      <input type="hidden" name="currency" value="${currency}" />
      <input type="hidden" name="language" value="${getMonriLanguage()}" />

      <input type="hidden" name="success_url_override" value="${getMonriSuccessUrl()}" />
      <input type="hidden" name="cancel_url_override" value="${getMonriCancelUrl()}" />
      <inputtype="hidden"name="ch_read_only"value="true"/>

      <input type="hidden" name="digest" value="${digest}" />
    </form>
  </body>
</html>
    `);
  } catch (error) {
    console.error("Monri redirect error:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "payment_initialization_failed",
      error,
    });
  }
};

exports.redirectToMonriWalletPay = async (req, res) => {
  try {
    const currency = getMonriCurrency();
    let { amount, orderType, orderNumber } = req.query;

    if (!orderNumber || !orderType || amount === undefined || amount === "") {
      return res.status(400).send("Missing required query params: amount, orderType, orderNumber");
    }

    amount = Number(amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).send("Invalid amount");
    }

    // Apple Pay is Apple-only, Google Pay is Android-only. A desktop browser
    // (no mobile UA) still sees both.
    const walletUa = String(req.headers["user-agent"] || "");
    const showApplePay = !/Android/i.test(walletUa);
    const showGooglePay = !/iPhone|iPad|iPod/i.test(walletUa);

    // Save transaction
    await monriRepository.createTransaction({
      orderNumber,
      amount,
      currency,
      orderType,
      status: "pending",
    });

    // Create Monri payment session
    const payload = {
      amount,
      currency,
      order_number: orderNumber,
      transaction_type: "purchase",
      order_info: "Mobile payment",
      scenario: "charge",
    };

    const body = JSON.stringify(payload);
    const authorization = buildAuthorizationHeader({ body });

    const response = await axios.post(
      `${getMonriBaseUrl()}/v2/payment/new`,
      body,
      {
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
      }
    );

    const clientSecret = response.data.client_secret;
    const trxToken = response.data.id;

    res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="${getMonriBaseUrl()}/dist/components.js"></script>

<style>
body {
  font-family: sans-serif;
  padding: 20px;
}

h3 {
  margin-bottom: 20px;
}

#card {
  margin-bottom: 25px;
}

#apple-pay,
#google-pay {
  margin-top: 15px;
}

button {
  margin-top: 15px;
  padding: 10px 16px;
  font-size: 16px;
}
</style>
</head>

<body>

<h3>Select payment method</h3>

<div id="card"></div>
<button id="payBtn">Pay with Card</button>

${showApplePay ? '<div id="apple-pay"></div>' : ""}
${showGooglePay ? '<div id="google-pay"></div>' : ""}

<script>

const monri = Monri("${getMonriAuthToken()}", {
  environment: "${getMonriComponentsEnv()}"
});

const components = monri.components({
  clientSecret: "${clientSecret}"
});

/* -----------------------
   CARD PAYMENT
----------------------- */

const card = components.create("card");
card.mount("card");

document.getElementById("payBtn").onclick = async function() {

  try {

    const result = await card.tokenize();

    if(result.status === "success") {

      window.location.href =
        "${getMonriSuccessUrl()}?order_number=${orderNumber}";

    } else {

      alert("Payment failed");

    }

  } catch(e) {
    alert("Payment error");
  }
};


${showApplePay ? `
const applePay = components.create("apple-pay", {
  trx_token: "${trxToken}",
  environment: "${getMonriComponentsEnv()}",
  transaction: {
    ch_full_name: "Test User",
    address: "Street 1",
    city: "Zagreb",
    zip: "10000",
    phone: "+385991234567",
    country: "${getMonriCountry()}",
    email: "test@test.com",
    orderInfo: "Mobile payment",
    language: "${getMonriLanguage()}",
    ch_read_only: "true",
  }
});
applePay.mount("apple-pay");
applePay.on("paymentSuccess", function() {
  window.location.href = "${getMonriSuccessUrl()}?order_number=${orderNumber}";
});
applePay.on("paymentError", function() {
  window.location.href = "${getMonriCancelUrl()}";
});
` : ""}

${showGooglePay ? `
const googlePay = components.create("google-pay", {
  trx_token: "${trxToken}",
  environment: "${getMonriComponentsEnv()}",
  countryCode: "${getMonriCountry()}",
  currencyCode: "${getMonriCurrency()}",
  ch_read_only: "true",
});
googlePay.mount("google-pay");
googlePay.on("paymentSuccess", function() {
  window.location.href = "${getMonriSuccessUrl()}?order_number=${orderNumber}";
});
googlePay.on("paymentError", function() {
  window.location.href = "${getMonriCancelUrl()}";
});
` : ""}



</script>

</body>
</html>
`);
  } catch (err) {
    console.error("Wallet pay init failed:", err.response?.data || err);
    const msg =
      err.response?.data?.message ||
      err.message ||
      "Payment init failed";
    // Client/config problems should not look like unexplained 500s
    const status =
      err.response?.status >= 400 && err.response?.status < 500
        ? 400
        : err.code === "ENOTFOUND" || err.code === "ECONNREFUSED"
          ? 502
          : 500;
    res.status(status).send(typeof msg === "string" ? msg : "Payment init failed");
  }
};



exports.handleSuccess = async (req, res) => {
  try {
    const payload = getMonriCallbackPayload(req);
    const orderNumber = payload.order_number;

    if (!orderNumber) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "missing_order_number",
      });
    }

    const tx = await monriRepository.findByOrderNumber(orderNumber);
    if (!tx) {
      console.warn("Order not found:", orderNumber);
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "transaction_not_found",
      });
    }

    const decision = evaluateMonriSuccessIntent({
      req,
      payload,
      tx,
      successUrl: getMonriSuccessUrl(),
    });

    if (decision.action === "reject") {
      if (decision.reason === "invalid_digest" && tx.status !== "paid") {
        await monriRepository.updateTransaction(orderNumber, {
          status: "invalid",
          rawCallback: payload,
        });
      }
      // Flat payment-callback contract — keep shape for clients
      return res.status(decision.httpStatus || 400).json({
        message:
          decision.reason === "invalid_digest"
            ? "Invalid digest"
            : decision.reason === "digest_required"
              ? "Missing digest"
              : decision.reason === "amount_mismatch"
                ? "Amount mismatch"
                : "Payment rejected",
        orderNumber,
        orderType: tx.orderType,
        userId: tx.userId,
        orderFulfilled: false,
        fulfillReason: decision.reason,
      });
    }

    if (decision.action === "ignore") {
      return res.status(200).json({
        message: "Payment pending",
        orderNumber,
        orderType: tx.orderType,
        userId: tx.userId,
        orderFulfilled: false,
        fulfillReason: decision.reason,
      });
    }

    const status = decision.action === "fulfill_failed" ? "failed" : "paid";

    // #25 / Monri v1.4 §3.2: the success redirect is the client returning to the
    // app. It never opens the document gate by itself: Monri is asked for the
    // order's status first. Unconfirmed stays pending for the callback and the
    // 15-minute reconcile job.
    if (status === "paid" && tx.status !== "paid") {
      const capture = await confirmMonriCapture(orderNumber, { persist: false });
      if (!capture.confirmed) {
        await monriRepository.updateTransaction(orderNumber, { rawCallback: payload });
        return res.status(200).json({
          message: "Payment pending",
          orderNumber,
          orderType: tx.orderType,
          userId: tx.userId,
          orderFulfilled: false,
          fulfillReason: capture.reason,
        });
      }
    }

    // Monri v1.4 §5.1 / §8: the pan_token is stored only encrypted on the
    // guest's saved card, never in the raw callback or in plain text.
    const { pan_token: panTokenFromMonri, ...payloadWithoutToken } = payload;
    const update = {
      rawCallback: payloadWithoutToken,
      ...(payload.approval_code && { approvalCode: payload.approval_code }),
      ...(payload.id != null && { monriTransactionId: String(payload.id) }),
    };
    if (tx.status !== "paid" && tx.status !== "refunded") {
      update.status = status;
    }

    await monriRepository.updateTransaction(orderNumber, update);

    // Approved (capture confirmed above): keep the card the guest chose to
    // save on Monri's form, or note that a saved card was used.
    if (status === "paid" && tx.userId) {
      try {
        if (panTokenFromMonri && payload.masked_pan) {
          await saveCardFromMonriPayment({
            userId: tx.userId,
            panToken: panTokenFromMonri,
            maskedPan: payload.masked_pan,
            ccType: payload.cc_type,
            orderNumber,
          });
        } else if (tx.savedCardId) {
          await touchCard(tx.savedCardId);
        }
      } catch (cardErr) {
        console.error("[saved-card] could not store card:", cardErr.message);
      }
    }

    let fulfill = { handled: false, reason: "not_attempted" };
    try {
      fulfill = (await fulfillMonriRedirectPayment({
        tx,
        payload,
        status,
      })) || fulfill;
    } catch (fulfillErr) {
      console.error("Monri success fulfill failed:", fulfillErr);
      fulfill = {
        handled: false,
        reason: fulfillErr.message || "fulfill_threw",
      };
    }

    const paid = status === "paid";
    const orderFulfilled =
      paid &&
      (Boolean(fulfill.handled) ||
        fulfill.reason === "duplicate event" ||
        decision.reason === "already_paid");
    return res.status(200).json({
      message: paid ? "Payment successful" : "Payment failed",
      orderNumber,
      orderType: tx.orderType,
      userId: tx.userId,
      orderFulfilled,
      fulfillReason: fulfill.reason || decision.reason || null,
    });
  } catch (err) {
    console.error("Monri success handler error:", err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "processing_failed",
      error: err,
    });
  }
};



/**
 * GET /app/payments/monri/status/:orderNumber
 * The app calls this only when the guest leaves the payment WebView without
 * our success/cancel redirect (back button). Pending → Monri is asked now;
 * an approved capture is fulfilled. Only the payer can query their payment.
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const tx = await monriRepository.findByOrderNumber(String(orderNumber || ""));
    if (!tx || String(tx.userId) !== String(req.user._id)) {
      return sendResponse({ res, statusCode: 404, translationKey: "transaction_not_found" });
    }

    const plain = typeof tx.toObject === "function" ? tx.toObject() : tx;
    const status = await checkPaymentStatusNow(plain);

    return res.status(200).json({
      orderNumber: plain.orderNumber,
      orderType: plain.orderType,
      status,
      paid: status === "paid",
    });
  } catch (err) {
    console.error("Monri status check error:", err);
    return sendResponse({ res, statusCode: 500, translationKey: "processing_failed", error: err });
  }
};

exports.handleCancel = async (req, res) => {
  try {
    const payload = getMonriCallbackPayload(req);


    const orderNumber = payload.order_number;
    if (!orderNumber) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "missing_order_number",
      });
    }

    const tx = await monriRepository.findByOrderNumber(orderNumber);
    if (!tx) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "transaction_not_found",
      });
    }

    if (tx.status === "paid" || tx.status === "refunded") {
      return res.status(200).json({
        message: "Payment already finalized",
        orderNumber,
        orderType: tx.orderType,
        userId: tx.userId,
      });
    }

    const hasCancelSignal =
      payload.response_code ||
      payload.status === "declined" ||
      payload.status === "cancelled" ||
      req.method === "POST";

    if (!hasCancelSignal && tx.status === "pending") {
      return res.status(200).json({
        message: "Payment pending",
        orderNumber,
        orderType: tx.orderType,
        userId: tx.userId,
      });
    }

    await monriRepository.updateTransaction(orderNumber, {
      status: "cancelled",
      rawCallback: payload,
    });

    return res.status(200).json({
      message: "Payment cancelled",
      orderNumber,
      orderType: tx.orderType,
      userId: tx.userId,
    });
  } catch (err) {
    console.error("Monri cancel handler error:", err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "processing_failed",
      error: err,
    });
  }
};



exports.createClientSecret = async (req, res) => {
  try {
    let { amount, currency = getMonriCurrency(), orderInfo } = req.body;

    amount = Number(amount);
    if (!Number.isInteger(amount)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "amount_must_be_integer_minor_units",
      });
    }

    const payload = {
      amount,
      order_number: crypto.randomUUID(),
      currency,
      transaction_type: "purchase",
      order_info: orderInfo,
      scenario: "charge",
    };

    const body = JSON.stringify(payload);

    const authorization = buildAuthorizationHeader({ body });

    const response = await axios.post(
      `${getMonriBaseUrl()}/v2/payment/new`,
      body,
      {
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({
      clientSecret: response.data.client_secret,
      status: response.data.status,
    });
  } catch (err) {
    console.error("Monri error:", err.response?.data || err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "failed_to_create_payment",
    });
  }
};

exports.createWebPaySession = async (req, res) => {
  try {
    // Populate the user to access their name information since billing does not have name fields
    const billing = await UserBillingInformation.findOne({
      user: req.user._id,
      status: "active",
    }).populate("user", "firstName lastName");

    const currency = getMonriCurrency();
    const { amount, orderType, orderNumber, paymentMethod } = req.query;
    const userId = req.user._id;

    if (!orderNumber || !orderType || amount === undefined || amount === "") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "missing_payment_params",
        error: { message: "amount, orderType and orderNumber are required" },
      });
    }

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_payment_amount",
      });
    }

    await assertAmountMatchesOrder(orderType, orderNumber, amountNum, userId);
    await assertBillkoReadyForMonriOrder(orderType, orderNumber);

    // Normalize query paymentMethod to DB enum value
    const dbPaymentMethod = normalizeDbPaymentMethod(paymentMethod);

    // Build reusable billing fields
    const billingAddress = billing?.billingAddress || {};
    // Buyer shown in Monri: billing record first, else the guest's own account
    // (most guests never fill billing details). "Guest User" only if both are empty.
    const fullName =
      `${billing?.user?.firstName || ""} ${billing?.user?.lastName || ""}`.trim() ||
      `${req.user?.firstName || ""} ${req.user?.lastName || ""}`.trim() ||
      req.user?.username ||
      "Guest User";
    const buyerEmail = billing?.email || req.user?.email || "";
    const country = billingAddress.country === "USA" ? "US" : (billingAddress.country || getMonriCountry());

    const digest = generateDigest({ orderNumber, amount, currency });

    // -----------------------------
    // CARD — form POST (WebView redirect)
    // -----------------------------
    if (!paymentMethod || paymentMethod === "card") {
      // Monri v1.4 §5.1 saved cards on the hosted form:
      //   saved card → its Monri token in supported_payment_methods: Monri
      //                shows the masked card and asks only for the CVV (+3DS);
      //   new card   → "card" + tokenize_pan_offered: Monri's own "save card"
      //                box (unticked); max 5 cards, so not offered at 5.
      // The token goes server → Monri only; the app never sees it.
      const { savedCardId } = req.query;
      let supportedPaymentMethods = "card";
      let tokenizeOffered = false;
      let savedCard = null;
      if (savedCardId) {
        if (!mongoose.Types.ObjectId.isValid(String(savedCardId))) {
          return sendResponse({ res, statusCode: 404, translationKey: "card_not_found" });
        }
        savedCard = await getCardTokenForPayment({ cardId: savedCardId, userId });
        if (!savedCard) {
          return sendResponse({ res, statusCode: 404, translationKey: "card_not_found" });
        }
        supportedPaymentMethods = savedCard.panToken;
      } else {
        tokenizeOffered = isMonriTokenizationEnabled() && (await canSaveMoreCards(userId));
      }

      await monriRepository.createTransaction({
        orderNumber,
        amount: Number(amount),
        currency,
        orderType,
        userId,
        status: "pending",
        paymentMethod: dbPaymentMethod,
        savedCardId: savedCard?.cardId || null,
      });

      const session = {
        authenticity_token: getMonriAuthToken(),
        transaction_type: "purchase",
        order_number: orderNumber,
        order_info: "App payment",
        amount: String(amount),
        currency,
        language: getMonriLanguage(),
        digest,
        success_url_override: getMonriSuccessUrl(),
        cancel_url_override: getMonriCancelUrl(),
        supported_payment_methods: supportedPaymentMethods,
        ...(tokenizeOffered && { tokenize_pan_offered: "true" }),
        ch_full_name: fullName,
        ch_address: billingAddress.address || "",
        ch_city: billingAddress.city || "",
        ch_zip: billingAddress.postalCode || "",
        ch_country: country,
        ch_email: buyerEmail,
        ch_phone: billing?.phone || "",
        form_action: `${getMonriBaseUrl()}/v2/form`,
      };

      let payment_url;
      try {
        payment_url = await createMonriCardPaymentUrl(session);
      } catch (formErr) {
        // §5.1: Monri reports the saved token invalid → mark the card Expired
        // (no longer offered) and ask the guest to pay with the card again.
        if (savedCard && JSON.stringify(formErr?.details || "").includes("unsupported payment method")) {
          await markCardExpired(savedCard.cardId).catch(() => {});
          console.warn(`[saved-card] Monri refused saved card ${savedCard.cardId}; marked expired`);
          return sendResponse({ res, statusCode: 409, translationKey: "saved_card_invalid" });
        }
        // Tokenization not active on the merchant account: the guest still
        // pays, just without the save-card box.
        const refusedTokenization = JSON.stringify(formErr?.details || "").includes(
          "tokenization has been requested",
        );
        if (!session.tokenize_pan_offered || !refusedTokenization) throw formErr;
        console.warn("[saved-card] Monri account has no tokenization; form without save box");
        delete session.tokenize_pan_offered;
        payment_url = await createMonriCardPaymentUrl(session);
      }
      return res.json({ payment_url });
    }

    // -----------------------------
    // APPLE PAY / GOOGLE PAY — Components
    // Requires a real clientSecret + trx_token from Monri API
    // -----------------------------
    const payload = {
      amount: Number(amount),
      currency,
      order_number: orderNumber,
      transaction_type: "purchase",
      order_info: "App payment",
      scenario: "charge",
    };

    const monriPayment = await createMonriWalletPayment(payload);

    const clientSecret = monriPayment.client_secret;
    const trx_token = monriPayment.id;

    await monriRepository.createTransaction({
      orderNumber,
      amount: Number(amount),
      currency,
      orderType,
      userId,
      status: "pending",
      paymentMethod: dbPaymentMethod,
    });

    const environment = getMonriComponentsEnv();

    const response = {
      authenticity_token: getMonriAuthToken(),
      clientSecret,
      trx_token,
      order_number: orderNumber,
      amount,
      currency,
      digest,
      // The app POSTs these fields to Monri's form in a WebView and closes it
      // on our success/cancel URL. Without the overrides Monri sends wallet
      // payments to the merchant-dashboard default and the WebView never closes.
      success_url_override: getMonriSuccessUrl(),
      cancel_url_override: getMonriCancelUrl(),
    };

    // -----------------------------
    // APPLE PAY (Component)
    // -----------------------------
    if (paymentMethod === "apple-pay") {
      response.locale = getMonriLocale();
      response.environment = environment;
      response.supported_payment_methods = "apple-pay";

      response.ch_full_name = fullName;
      response.ch_address = billingAddress.address || "";
      response.ch_city = billingAddress.city || "";
      response.ch_zip = billingAddress.postalCode || "";
      response.ch_country = country;
      response.ch_email = buyerEmail;
      response.ch_phone = billing?.phone || "";
    }

    // -----------------------------
    // GOOGLE PAY (Component)
    // -----------------------------
    if (paymentMethod === "google-pay") {
      response.countryCode = country || getMonriCountry();
      response.environment = environment;
      response.supported_payment_methods = "google-pay";

      response.ch_full_name = fullName;
      response.ch_address = billingAddress.address || "";
      response.ch_city = billingAddress.city || "";
      response.ch_zip = billingAddress.postalCode || "";
      response.ch_country = country;
      response.ch_email = buyerEmail;
      response.ch_phone = billing?.phone || "";
    }

    return res.json(response);
  } catch (err) {
    console.error("❌ createWebPaySession failed:", err);

    if (err.code === "PAYMENT_AMOUNT_CHECK") {
      return sendResponse({
        res,
        statusCode: err.statusCode || 400,
        translationKey: err.message,
      });
    }

    if (err.code === "ORDER_ALREADY_FINALIZED" || err.statusCode === 409) {
      return sendResponse({
        res,
        statusCode: 409,
        translationKey: err.message,
        translateMessage: false,
        error: err,
      });
    }

    if (err.statusCode === 403) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: err.message,
        translateMessage: false,
        error: err,
      });
    }

    if (err.message === "monri_form_failed" || err.code === "ENOTFOUND" || err.statusCode === 502) {
      return sendResponse({
        res,
        statusCode: 502,
        translationKey: "failed_to_open_monri_card_form",
        error: err,
      });
    }

    if (err.code === 11000) {
      return sendResponse({
        res,
        statusCode: 409,
        translationKey: "order_number_already_exists",
      });
    }

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "payment_init_failed",
      error: err,
    });
  }
};

/**
 * Subscription web-pay session.
 * Frontend generates orderNumber and posts amount + subscriptionTypes.
 * Billing is optional — Monri form collects it on submission.
 */
exports.createSubscriptionWebPaySession = async (req, res) => {
  try {
    const currency = getMonriCurrency();
    const {
      amount,
      orderNumber,
      subscriptionTypes,
      paymentMethod,
    } = { ...req.query, ...req.body };

    if (!orderNumber) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "order_number_required",
      });
    }

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "amount_must_be_positive_minor_units",
      });
    }

    let parsedSubscriptionTypes = subscriptionTypes;
    if (typeof subscriptionTypes === "string") {
      try {
        parsedSubscriptionTypes = JSON.parse(subscriptionTypes);
      } catch {
        parsedSubscriptionTypes = subscriptionTypes.split(",").map((t) => t.trim());
      }
    }

    if (!Array.isArray(parsedSubscriptionTypes) || parsedSubscriptionTypes.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "subscriptionTypes_must_be_non_empty_array",
      });
    }

    const uniqueTypes = [...new Set(parsedSubscriptionTypes)];
    const invalidTypes = uniqueTypes.filter(
      (type) => !PAID_SUBSCRIPTION_TYPES.includes(type)
    );
    if (invalidTypes.length > 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_subscription_types",
        values: { types: invalidTypes.join(", ") },
        data: { allowed: PAID_SUBSCRIPTION_TYPES },
      });
    }

    const userId = req.user._id;
    const amountStr = String(amountNumber);
    const dbPaymentMethod = normalizeDbPaymentMethod(paymentMethod);

    // Billing optional — use if present, otherwise empty (Monri form fills it)
    const billing = await UserBillingInformation.findOne({
      user: userId,
      status: "active",
    });
    const billingAddress = billing?.billingAddress || {};
    const fullName = `${billing?.firstName || ""} ${billing?.lastName || ""}`.trim();
    const country = billingAddress.country === "USA" ? "US" : (billingAddress.country || getMonriCountry());

    const digest = generateDigest({
      orderNumber,
      amount: amountStr,
      currency,
    });

    await monriRepository.createTransaction({
      orderNumber,
      amount: amountNumber,
      currency,
      orderType: "subscription",
      userId,
      subscriptionTypes: uniqueTypes,
      status: "pending",
      paymentMethod: dbPaymentMethod,
    });

    const customerFields = {
      ch_full_name: fullName,
      ch_address: billingAddress.address || "",
      ch_city: billingAddress.city || "",
      ch_zip: billingAddress.postalCode || "",
      ch_country: country,
      ch_email: billing?.email || "",
      ch_phone: billing?.phone || "",
    };

    // Card — same as /web-pay-session: only payment_url goes to the app
    if (!paymentMethod || paymentMethod === "card") {
      const session = {
        authenticity_token: getMonriAuthToken(),
        transaction_type: "purchase",
        order_number: orderNumber,
        order_info: `Subscription: ${uniqueTypes.join(", ")}`,
        amount: amountStr,
        currency,
        language: getMonriLanguage(),
        digest,
        success_url_override: getMonriSuccessUrl(),
        cancel_url_override: getMonriCancelUrl(),
        supported_payment_methods: "card",
        ...customerFields,
        form_action: `${getMonriBaseUrl()}/v2/form`,
      };
      const payment_url = await createMonriCardPaymentUrl(session);
      return res.json({ payment_url });
    }

    // Apple Pay / Google Pay — same shape as /web-pay-session
    const payload = {
      amount: amountNumber,
      currency,
      order_number: orderNumber,
      transaction_type: "purchase",
      order_info: `Subscription: ${uniqueTypes.join(", ")}`,
      scenario: "charge",
    };

    const monriPayment = await createMonriWalletPayment(payload);

    const environment = getMonriComponentsEnv();
    const response = {
      authenticity_token: getMonriAuthToken(),
      clientSecret: monriPayment.client_secret,
      trx_token: monriPayment.id,
      order_number: orderNumber,
      amount: amountStr,
      currency,
      digest,
      // Same as /web-pay-session: return to our success/cancel URL, not the
      // merchant-dashboard default, so the app's WebView can close.
      success_url_override: getMonriSuccessUrl(),
      cancel_url_override: getMonriCancelUrl(),
      ...customerFields,
    };

    if (paymentMethod === "apple-pay") {
      response.locale = getMonriLocale();
      response.environment = environment;
      response.supported_payment_methods = "apple-pay";
    }

    if (paymentMethod === "google-pay") {
      response.countryCode = country || getMonriCountry();
      response.environment = environment;
      response.supported_payment_methods = "google-pay";
    }

    return res.json(response);
  } catch (err) {
    console.error("❌ createSubscriptionWebPaySession failed:", err);

    if (err.code === "ORDER_ALREADY_FINALIZED" || err.statusCode === 409) {
      return sendResponse({
        res,
        statusCode: 409,
        translationKey: err.message,
        translateMessage: false,
        error: err,
      });
    }

    // Duplicate key from unique orderNumber race
    if (err.code === 11000) {
      return sendResponse({
        res,
        statusCode: 409,
        translationKey: "order_number_already_exists",
      });
    }

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "subscription_payment_init_failed",
      error: err,
    });
  }
};

/**
 * Manual refund (Monri v1.4 §6.2–6.3): superadmin only, always the full
 * captured amount (no partial refunds). Menu orders go through the order
 * refund service (voucher part, storno, payout guard, idempotent).
 */
exports.refundPayment = async (req, res) => {
  try {
    if (req.user?.userType !== "admin") {
      return sendResponse({ res, statusCode: 403, translationKey: "refund_not_allowed" });
    }
    if (!isLiveRefundEnabled()) {
      return sendResponse({
        res,
        statusCode: 503,
        translationKey: "live_refund_disabled",
      });
    }

    const { orderNumber } = req.body;
    const tx = await monriRepository.findByOrderNumber(orderNumber);

    if (tx?.orderType === "menuorders") {
      const { refundPaidMenuOrder } = require("../../menuItemsAndOrders/orderRefundService");
      const result = await refundPaidMenuOrder({
        orderId: tx.orderNumber,
        reasonCode: "admin_refund",
        requestedBy: req.user._id,
      });
      return res.status(result.status === "refunded" ? 200 : 409).json(result);
    }

    const plan = planMonriRefund({ tx, amount: tx?.amount });
    if (!plan.ok) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: plan.error,
        translateMessage: false,
      });
    }

    const result = await refundViaMonri({
      orderNumber: tx.orderNumber,
      amountCents: tx.amount,
      currency: tx.currency || "EUR",
    });
    if (result.outcome !== "approved") {
      return res.status(409).json({ status: "failed", monri: result.response });
    }

    await monriRepository.updateTransaction(orderNumber, {
      status: plan.nextStatus,
      refundedAmount: plan.nextRefundedAmount,
    });

    const {
      issueCancellationConfirmation,
    } = require("../../fiscalDocuments/confirmation/generator");
    const PaymentConfirmation = require("../../fiscalDocuments/models/PaymentConfirmation.model");
    const mongoose = require("mongoose");
    const orderObjectId = mongoose.Types.ObjectId.isValid(tx.orderNumber)
      ? new mongoose.Types.ObjectId(String(tx.orderNumber))
      : null;
    const original = orderObjectId
      ? await PaymentConfirmation.findOne({
          orderId: orderObjectId,
          $or: [
            { cancelsConfirmationId: null },
            { cancelsConfirmationId: { $exists: false } },
          ],
          status: "ISSUED",
        })
      : null;
    if (original) {
      // No amount: the storno repeats the original's full amount (EUR).
      await issueCancellationConfirmation(original, {
        transactionId: tx.monriTransactionId,
      });
    }

    // Also cancel min-spend voucher when refunding a reservation (even if
    // confirmation cancel already did it — idempotent status write).
    if (tx.orderType === "userreservations" && orderObjectId) {
      const { UserReservations } = require("../../reservations/UsersReservation");
      await UserReservations.updateOne(
        {
          _id: orderObjectId,
          "voucher.code": { $exists: true, $nin: [null, ""] },
        },
        { $set: { "voucher.status": "cancelled" } },
      );
    }

    if (tx.orderType === "ticketingbookings") {
      const { stornoTicketingInvoices } = require("../../fiscalDocuments/jobs/documentService");
      // execute:true = attempt live; still gated by BILLKO_STORNO_ENABLED (default off).
      await stornoTicketingInvoices(tx.orderNumber, {
        execute: true,
        refundAmount: null, // full refund
      });
    }

    res.json({ status: "refunded", monri: result.response });
  } catch (err) {
    console.error("Refund error:", err);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "refund_failed",
      error: err,
    });
  }
};


