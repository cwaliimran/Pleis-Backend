const crypto = require("crypto");
const axios = require("axios");
const { buildAuthorizationHeader } = require("./monriAuth");
const { sendResponse } = require("../../../helperUtils/responseUtil");

const monriRepository = require("./monriRepository");
const { verifyTransaction, createTransactionMonriOrder } = require("./monriService");
const { UserBillingInformation } = require("../../transactions/UserBillingInformation");
const { SubscriptionTypes } = require("../../../models/UserModel");
const {
  assertOrganizerBillkoReady,
} = require("../billko/billkoCredentials");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { UserReservations } = require("@UserReservationsModel");
const MenuOrders = require("@OrdersModel");
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
    err?.code === "ECONNREFUSED"
  );
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

<div id="apple-pay"></div>
<div id="google-pay"></div>

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


/* -----------------------
   APPLE PAY
----------------------- */

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


/* -----------------------
   GOOGLE PAY
----------------------- */

const googlePay = components.create("google-pay", {
  trx_token: "${trxToken}",
  environment: "${getMonriComponentsEnv()}",
  countryCode: "${getMonriCountry()}",
  currencyCode: "${getMonriCurrency()}",
  ch_read_only: "true",
});

googlePay.mount("google-pay");


/* -----------------------
   SUCCESS EVENTS
----------------------- */

applePay.on("paymentSuccess", function(result) {
  window.location.href =
    "${getMonriSuccessUrl()}?order_number=${orderNumber}";
});

googlePay.on("paymentSuccess", function(result) {
  window.location.href =
    "${getMonriSuccessUrl()}?order_number=${orderNumber}";
});


/* -----------------------
   ERROR EVENTS
----------------------- */

applePay.on("paymentError", function() {
  window.location.href = "${getMonriCancelUrl()}";
});

googlePay.on("paymentError", function() {
  window.location.href = "${getMonriCancelUrl()}";
});

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
    const update = {
      rawCallback: payload,
      ...(payload.approval_code && { approvalCode: payload.approval_code }),
      ...(payload.id != null && { monriTransactionId: String(payload.id) }),
      ...(payload.pan_token && { panToken: payload.pan_token }),
    };
    if (tx.status !== "paid" && tx.status !== "refunded") {
      update.status = status;
    }

    await monriRepository.updateTransaction(orderNumber, update);

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

    await assertBillkoReadyForMonriOrder(orderType, orderNumber);

    // Normalize query paymentMethod to DB enum value
    const dbPaymentMethod = normalizeDbPaymentMethod(paymentMethod);

    // Build reusable billing fields
    const billingAddress = billing?.billingAddress || {};
    const fullName =
      `${billing?.user?.firstName || ""} ${billing?.user?.lastName || ""}`.trim() || "Guest User";
    const country = billingAddress.country === "USA" ? "US" : (billingAddress.country || getMonriCountry());

    const digest = generateDigest({ orderNumber, amount, currency });

    // -----------------------------
    // CARD — form POST (WebView redirect)
    // -----------------------------
    if (!paymentMethod || paymentMethod === "card") {
      await monriRepository.createTransaction({
        orderNumber,
        amount: Number(amount),
        currency,
        orderType,
        userId,
        status: "pending",
        paymentMethod: dbPaymentMethod,
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
        supported_payment_methods: "card",
        ch_full_name: fullName,
        ch_address: billingAddress.address || "",
        ch_city: billingAddress.city || "",
        ch_zip: billingAddress.postalCode || "",
        ch_country: country,
        ch_email: billing?.email || "",
        ch_phone: billing?.phone || "",
        form_action: `${getMonriBaseUrl()}/v2/form`,
      };

      const payment_url = await createMonriCardPaymentUrl(session);
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

    const body = JSON.stringify(payload);
    const authorization = buildAuthorizationHeader({ body });

    const monriApiResponse = await axios.post(
      `${getMonriBaseUrl()}/v2/payment/new`,
      body,
      {
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
      }
    );

    const clientSecret = monriApiResponse.data.client_secret;
    const trx_token = monriApiResponse.data.id;

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
      response.ch_email = billing?.email || "";
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
      response.ch_email = billing?.email || "";
      response.ch_phone = billing?.phone || "";
    }

    return res.json(response);
  } catch (err) {
    console.error("❌ createWebPaySession failed:", err);

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

    const body = JSON.stringify(payload);
    const authorization = buildAuthorizationHeader({ body });

    const monriApiResponse = await axios.post(
      `${getMonriBaseUrl()}/v2/payment/new`,
      body,
      {
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
      }
    );

    const environment = getMonriComponentsEnv();
    const response = {
      authenticity_token: getMonriAuthToken(),
      clientSecret: monriApiResponse.data.client_secret,
      trx_token: monriApiResponse.data.id,
      order_number: orderNumber,
      amount: amountStr,
      currency,
      digest,
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

exports.refundPayment = async (req, res) => {
  try {
    if (!isLiveRefundEnabled()) {
      return sendResponse({
        res,
        statusCode: 503,
        translationKey: "live_refund_disabled",
      });
    }

    const { orderNumber, amount } = req.body;
    const tx = await monriRepository.findByOrderNumber(orderNumber);
    const plan = planMonriRefund({ tx, amount });
    if (!plan.ok) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: plan.error,
        translateMessage: false,
      });
    }

    const result = await refundViaMonri({
      transactionId: tx.monriTransactionId,
      amount: plan.refundAmount,
      currency: tx.currency,
    });

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
      await issueCancellationConfirmation(original, {
        transactionId: tx.monriTransactionId,
        amount: plan.refundAmount,
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
        refundAmount: plan.refundAmount,
      });
    }

    res.json(result);
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


