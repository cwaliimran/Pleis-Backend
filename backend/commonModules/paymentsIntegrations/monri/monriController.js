const crypto = require("crypto");
const axios = require("axios");
const { buildAuthorizationHeader } = require("./monriAuth");

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

const FORCE_MONRI_TEST_ENV = true;
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

function isApprovedMonriResponse(payload) {
  return (
    payload.response_code === "0000" ||
    payload.response_code === "000" ||
    payload.status === "approved"
  );
}

function isMonriProduction() {
  if (FORCE_MONRI_TEST_ENV) return false;

  return ["prod", "production"].includes(
    String(process.env.NODE_ENV || "").toLowerCase()
  );
}

function getMonriBaseUrl() {
  return isMonriProduction()
    ? "https://ipg.monri.com"
    : "https://ipgtest.monri.com";
}

function getMonriComponentsEnv() {
  return isMonriProduction() ? "prod" : "test";
}

/**
 * digest = SHA512(key + order_number + amount + currency)
 */
function generateDigest({ orderNumber, amount, currency }) {
  const raw = `${process.env.MONRI_KEY}${orderNumber}${amount}${currency}`;
  return crypto.createHash("sha512").update(raw).digest("hex");
}


exports.redirectToMonriWebPay = async (req, res) => {
  try {
    // --- REQUIRED PAYMENT DATA ---

    const currency = "EUR";
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
      <input type="hidden" name="authenticity_token" value="${process.env.MONRI_AUTH_TOKEN}" />
      <input type="hidden" name="transaction_type" value="purchase" />

      <input type="hidden" name="order_number" value="${orderNumber}" />
      <input type="hidden" name="order_info" value="Test payment" />

      <input type="hidden" name="amount" value="${amount}" />
      <input type="hidden" name="currency" value="${currency}" />
      <input type="hidden" name="language" value="en" />

      <input type="hidden" name="success_url_override" value="${process.env.SUCCESS_URL}" />
      <input type="hidden" name="cancel_url_override" value="${process.env.CANCEL_URL}" />
      <inputtype="hidden"name="ch_read_only"value="true"/>

      <input type="hidden" name="digest" value="${digest}" />
    </form>
  </body>
</html>
    `);
  } catch (error) {
    console.error("Monri redirect error:", error);
    res.status(500).json({
      message: "Payment initialization failed",
    });
  }
};

exports.redirectToMonriWalletPay = async (req, res) => {
  try {
    const currency = "EUR";
    let { amount, orderType, orderNumber } = req.query;

    amount = Number(amount);

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

const monri = Monri("${process.env.MONRI_AUTH_TOKEN}", {
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
        "${process.env.SUCCESS_URL}?order_number=${orderNumber}";

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
    country: "HR",
    email: "test@test.com",
    orderInfo: "Mobile payment",
    language: "en",
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
  countryCode: "HR",
  currencyCode: "EUR",
  ch_read_only: "true",
});

googlePay.mount("google-pay");


/* -----------------------
   SUCCESS EVENTS
----------------------- */

applePay.on("paymentSuccess", function(result) {
  window.location.href =
    "${process.env.SUCCESS_URL}?order_number=${orderNumber}";
});

googlePay.on("paymentSuccess", function(result) {
  window.location.href =
    "${process.env.SUCCESS_URL}?order_number=${orderNumber}";
});


/* -----------------------
   ERROR EVENTS
----------------------- */

applePay.on("paymentError", function() {
  window.location.href = "${process.env.CANCEL_URL}";
});

googlePay.on("paymentError", function() {
  window.location.href = "${process.env.CANCEL_URL}";
});

</script>

</body>
</html>
`);
  } catch (err) {
    console.error("Wallet pay init failed:", err.response?.data || err);
    res.status(500).send("Payment init failed");
  }
};



exports.handleSuccess = async (req, res) => {
  try {
    const payload = getMonriCallbackPayload(req);


    const orderNumber = payload.order_number;

    if (!orderNumber) {
      return res.status(400).json({ message: "Missing order_number" });
    }

    const tx = await monriRepository.findByOrderNumber(orderNumber);
    if (!tx) {
      console.warn("Order not found:", orderNumber);
      return res.status(404).json({ message: "Transaction not found" });
    }

    // Browser redirect includes digest — verify it.
    // Merchant server-to-server callback is JSON without digest.
    if (payload.digest) {
      const isValid = verifyMonriSuccessDigest({
        payload,
        successUrl: process.env.SUCCESS_URL,
      });

      if (!isValid) {
        await monriRepository.updateTransaction(orderNumber, {
          status: "invalid",
          rawCallback: payload,
        });

        return res.status(400).json({ message: "Invalid digest" });
      }
    }

    const approved = isApprovedMonriResponse(payload);
    const update = {
      rawCallback: payload,
      ...(payload.approval_code && { approvalCode: payload.approval_code }),
      ...(payload.id != null && { monriTransactionId: String(payload.id) }),
      ...(payload.pan_token && { panToken: payload.pan_token }),
    };

    if (approved) {
      update.status = "paid";
    } else {
      update.status = "failed";
    }

    await monriRepository.updateTransaction(orderNumber, update);

    return res.status(200).json({
      message: approved ? "Payment successful" : "Payment failed",
      orderNumber,
      orderType: tx.orderType,
      userId: tx.userId,
    });
  } catch (err) {
    console.error("Monri success handler error:", err);
    return res.status(500).json({ message: "Processing failed" });
  }
};



exports.handleCancel = async (req, res) => {
  try {
    const payload = getMonriCallbackPayload(req);


    const orderNumber = payload.order_number;
    if (!orderNumber) {
      return res.status(400).json({ message: "Missing order_number" });
    }

    const tx = await monriRepository.findByOrderNumber(orderNumber);
    if (!tx) {
      return res.status(404).json({ message: "Transaction not found" });
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
    return res.status(500).json({ message: "Processing failed" });
  }
};



function verifyMonriSuccessDigest({ payload, successUrl }) {
  const url = new URL(successUrl);

  // Append all params EXCEPT digest
  Object.keys(payload).forEach((key) => {
    if (key !== "digest") {
      url.searchParams.append(key, payload[key]);
    }
  });

  const raw = `${process.env.MONRI_KEY}${url.toString()}`;
  const expected = crypto.createHash("sha512").update(raw).digest("hex");

  return expected === payload.digest;
}


exports.createClientSecret = async (req, res) => {
  try {
    let { amount, currency = "EUR", orderInfo } = req.body;

    amount = Number(amount);
    if (!Number.isInteger(amount)) {
      return res.status(400).json({ message: "Amount must be integer (minor units)" });
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
    return res.status(500).json({ message: "Failed to create payment" });
  }
};

exports.createWebPaySession = async (req, res) => {
  try {
    const billing = await UserBillingInformation.findOne({
      user: req.user._id,
      status: "active",
    });

    const currency = "EUR";
    const { amount, orderType, orderNumber, paymentMethod } = req.query;
    const userId = req.user._id;

    await assertBillkoReadyForMonriOrder(orderType, orderNumber);

    // Normalize query paymentMethod to DB enum value
    const dbPaymentMethod = normalizeDbPaymentMethod(paymentMethod);

    // Build reusable billing fields
    const billingAddress = billing?.billingAddress || {};
    const fullName = `${billing?.firstName || ""} ${billing?.lastName || ""}`.trim() || "Guest User";
    const country = billingAddress.country === "USA" ? "US" : (billingAddress.country || "");

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

      return res.json({
        authenticity_token: process.env.MONRI_AUTH_TOKEN,
        transaction_type: "purchase",
        order_number: orderNumber,
        order_info: "App payment",
        amount,
        currency,
        language: "en",
        digest,
        success_url_override: process.env.SUCCESS_URL,
        cancel_url_override: process.env.CANCEL_URL,
        supported_payment_methods: "card",
        // Monri form ch_* customer fields
        ch_full_name: fullName,
        ch_address: billingAddress.address || "",
        ch_city: billingAddress.city || "",
        ch_zip: billingAddress.postalCode || "",
        ch_country: country,
        ch_email: billing?.email || "",
        ch_phone: billing?.phone || "",
      });
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
      authenticity_token: process.env.MONRI_AUTH_TOKEN,
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
      response.locale = "en-US";
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
      response.countryCode = country || "US";
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
      return res.status(409).json({ message: err.message });
    }

    if (err.statusCode === 403) {
      return res.status(403).json({ message: err.message });
    }

    if (err.code === 11000) {
      return res.status(409).json({
        message: "orderNumber already exists — generate a new one",
      });
    }

    return res.status(500).json({
      message: "Init failed",
      error: {
        message: err.message,
        name: err.name,
      },
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
    const currency = "EUR";
    const {
      amount,
      orderNumber,
      subscriptionTypes,
      paymentMethod,
    } = { ...req.query, ...req.body };

    if (!orderNumber) {
      return res.status(400).json({ message: "orderNumber is required" });
    }

    const amountNumber = Number(amount);
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return res.status(400).json({ message: "amount must be a positive number (minor units)" });
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
      return res.status(400).json({
        message: "subscriptionTypes must be a non-empty array",
      });
    }

    const uniqueTypes = [...new Set(parsedSubscriptionTypes)];
    const invalidTypes = uniqueTypes.filter(
      (type) => !PAID_SUBSCRIPTION_TYPES.includes(type)
    );
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        message: `Invalid subscriptionTypes: ${invalidTypes.join(", ")}`,
        allowed: PAID_SUBSCRIPTION_TYPES,
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
    const country = billingAddress.country === "USA" ? "US" : (billingAddress.country || "");

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

    // Card — same shape as /web-pay-session
    if (!paymentMethod || paymentMethod === "card") {
      return res.json({
        authenticity_token: process.env.MONRI_AUTH_TOKEN,
        transaction_type: "purchase",
        order_number: orderNumber,
        order_info: `Subscription: ${uniqueTypes.join(", ")}`,
        amount: amountStr,
        currency,
        language: "en",
        digest,
        success_url_override: process.env.SUCCESS_URL,
        cancel_url_override: process.env.CANCEL_URL,
        supported_payment_methods: "card",
        ...customerFields,
      });
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
      authenticity_token: process.env.MONRI_AUTH_TOKEN,
      clientSecret: monriApiResponse.data.client_secret,
      trx_token: monriApiResponse.data.id,
      order_number: orderNumber,
      amount: amountStr,
      currency,
      digest,
      ...customerFields,
    };

    if (paymentMethod === "apple-pay") {
      response.locale = "en-US";
      response.environment = environment;
      response.supported_payment_methods = "apple-pay";
    }

    if (paymentMethod === "google-pay") {
      response.countryCode = country || "US";
      response.environment = environment;
      response.supported_payment_methods = "google-pay";
    }

    return res.json(response);
  } catch (err) {
    console.error("❌ createSubscriptionWebPaySession failed:", err);

    if (err.code === "ORDER_ALREADY_FINALIZED" || err.statusCode === 409) {
      return res.status(409).json({ message: err.message });
    }

    // Duplicate key from unique orderNumber race
    if (err.code === 11000) {
      return res.status(409).json({
        message: "orderNumber already exists — generate a new one",
      });
    }

    return res.status(500).json({
      message: "Subscription payment init failed",
      error: {
        message: err.message,
        name: err.name,
      },
    });
  }
};

async function refundViaMonri({
  transactionId,
  amount,
  currency,
}) {
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
        Authorization: `key-${process.env.MONRI_AUTH_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}


exports.refundPayment = async (req, res) => {
  try {
    const { orderNumber, amount } = req.body;

    const tx = await monriRepository.findByOrderNumber(orderNumber);

    if (!tx?.monriTransactionId) {
      return res.status(400).json({
        message: "Transaction not refundable",
      });
    }

    const result = await refundViaMonri({
      transactionId: tx.monriTransactionId,
      amount: amount || tx.amount,
      currency: tx.currency,
    });

    await monriRepository.updateTransaction(orderNumber, {
      status: "refunded",
      refundedAmount: amount || tx.amount,
    });

    res.json(result);
  } catch (err) {
    console.error("Refund error:", err);
    res.status(500).json({ message: "Refund failed" });
  }
};


