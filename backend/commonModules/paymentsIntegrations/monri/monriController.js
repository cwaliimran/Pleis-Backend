const crypto = require("crypto");
const axios = require("axios");
const { buildAuthorizationHeader } = require("./monriAuth");

const monriRepository = require("./monriRepository");
const { verifyTransaction, createTransactionMonriOrder } = require("./monriService");

/**
 * digest = SHA512(key + order_number + amount + currency)
 */
function generateDigest({ orderNumber, amount, currency }) {
  const raw = `${process.env.MONRI_KEY}${orderNumber}${amount}${currency}`;
  return crypto.createHash("sha512").update(raw).digest("hex");
}


exports.redirectToMonri = async (req, res) => {
  try {
    // --- REQUIRED PAYMENT DATA ---

    let orderNumber = crypto.randomUUID();
    const currency = "EUR";
    const amount = 500;

    // --- PERSIST TRANSACTION (so we can track it) ---
    await monriRepository.createTransaction({
      orderNumber: orderNumber,
      amount,
      currency,
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

    <form method="POST" action="https://ipgtest.monri.com/v2/form">
      <input type="hidden" name="authenticity_token" value="${process.env.MONRI_AUTH_TOKEN}" />
      <input type="hidden" name="transaction_type" value="purchase" />

      <input type="hidden" name="order_number" value="${orderNumber}" />
      <input type="hidden" name="order_info" value="Test payment" />

      <input type="hidden" name="amount" value="${amount}" />
      <input type="hidden" name="currency" value="${currency}" />
      <input type="hidden" name="language" value="en" />

      <input type="hidden" name="success_url_override" value="${process.env.SUCCESS_URL}" />
      <input type="hidden" name="cancel_url_override" value="${process.env.CANCEL_URL}" />

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


exports.handleSuccess = async (req, res) => {
  try {
    const payload = req.query;

    console.log("MONRI SUCCESS:", payload);

    const orderNumber =
      payload.order_number ||
      payload["order-number"] ||
      payload.orderNumber;

    if (!orderNumber) {
      return res.status(400).json({ message: "Missing order_number" });
    }

    const tx = await monriRepository.findByOrderNumber(orderNumber);
    if (!tx) {
      console.warn("Order not found:", orderNumber);
      return res.status(404).json({ message: "Transaction not found" });
    }

    const isValid = verifyMonriSuccessDigest({
      payload,
      successUrl: process.env.SUCCESS_URL
    });

    if (!isValid) {
      await monriRepository.updateTransaction(orderNumber, {
        status: "invalid",
        rawCallback: payload
      });

      return res.status(400).json({ message: "Invalid digest" });
    }

    const trx = await verifyTransaction(orderNumber);

    if (trx.status === "approved") {
      await monriRepository.updateTransaction(orderNumber, {
        status: "paid",
        approvalCode: trx.approval_code,
        panToken: trx.pan_token,
        rawCallback: payload
      });
    } else {
      await monriRepository.updateTransaction(orderNumber, {
        status: "failed",
        rawCallback: payload
      });
    }

    return res.status(200).json({
      message: "Payment successful",
      orderNumber
    });

  } catch (err) {
    console.error("Monri success handler error:", err);
    return res.status(500).json({ message: "Processing failed" });
  }
};



exports.handleCancel = async (req, res) => {
  try {
    const payload = req.query;
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
      rawCallback: payload
    });

    return res.status(200).json({
      message: "Payment cancelled",
      orderNumber
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
      "https://ipgtest.monri.com/v2/payment/new",
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
    // --- REQUIRED PAYMENT DATA ---
    const currency = "EUR";
    const amount = 500;
    let orderNumber = crypto.randomUUID();
    let monriOrder = await monriRepository.createTransaction({
      orderNumber: orderNumber,
      amount: amount,
      currency,
      status: "pending",
    });

    const digest = generateDigest({
      orderNumber: monriOrder.orderNumber,
      amount,
      currency,
    });

    res.json({
      authenticity_token: process.env.MONRI_AUTH_TOKEN,
      transaction_type: "purchase",
      order_number: orderNumber,
      order_info: "App payment",
      amount,
      currency,
      language: "en",
      success_url_override: process.env.SUCCESS_URL,
      cancel_url_override: process.env.CANCEL_URL,
      digest,
    });
  } catch (err) {
    res.status(500).json({ message: "Init failed", error: err });
  }
};


