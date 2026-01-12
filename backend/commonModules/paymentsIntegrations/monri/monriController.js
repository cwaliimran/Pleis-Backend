const crypto = require("crypto");
const monriRepository = require("./monriRepository");

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
    const orderNumber = crypto.randomUUID();
    const amount = 500; // 5.00 EUR (minor units)
    const currency = "EUR";

    // --- PERSIST TRANSACTION (so we can track it) ---
    await monriRepository.createTransaction({
      orderNumber,
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

async function extractPayload(req) {
  // Prefer body, fall back to query string
  if (req.body && Object.keys(req.body).length) return req.body;
  return req.query || {};
}

exports.handleSuccess = async (req, res) => {
  try {
    const payload = await extractPayload(req);
    const orderNumber = payload.order_number || payload.orderNumber;

    if (!orderNumber) {
      console.log("Payload:", payload);
      return res.status(400).json({ message: "Missing order_number" });
    }

    const tx = await monriRepository.findByOrderNumber(orderNumber);
    if (!tx) {
      console.warn("Monri success callback for unknown order", { orderNumber });
      return res.status(404).json({ message: "Transaction not found" });
    }

    const amount = payload.amount ? Number(payload.amount) : tx.amount;
    const currency = payload.currency || tx.currency || "EUR";
    const digest = payload.digest;

    if (!digest) {
      return res.status(400).json({ message: "Missing digest" });
    }

    const expected = generateDigest({ orderNumber, amount, currency });
    if (expected !== digest) {
      console.warn("Monri success digest mismatch", { orderNumber });
      await monriRepository.updateTransaction(orderNumber, { rawCallback: payload });
      return res.status(400).json({ message: "Invalid digest" });
    }

    const approvalCode = payload.approval_code || payload.approvalCode || payload.approval;

    await monriRepository.updateTransaction(orderNumber, {
      status: "paid",
      approvalCode,
      rawCallback: payload,
    });

    return res.status(200).json({ message: "Payment recorded", orderNumber });
  } catch (error) {
    console.error("Monri success handler error:", error);
    return res.status(500).json({ message: "Processing failed" });
  }
};

exports.handleCancel = async (req, res) => {
  try {
    const payload = await extractPayload(req);
    const orderNumber = payload.order_number || payload.orderNumber;

    if (!orderNumber) {
      return res.status(400).json({ message: "Missing order_number" });
    }

    const tx = await monriRepository.findByOrderNumber(orderNumber);
    if (!tx) {
      console.warn("Monri cancel callback for unknown order", { orderNumber });
      return res.status(404).json({ message: "Transaction not found" });
    }

    await monriRepository.updateTransaction(orderNumber, {
      status: "failed",
      rawCallback: payload,
    });

    return res.status(200).json({ message: "Payment cancelled", orderNumber });
  } catch (error) {
    console.error("Monri cancel handler error:", error);
    return res.status(500).json({ message: "Processing failed" });
  }
};
