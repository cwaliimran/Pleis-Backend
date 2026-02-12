const { default: mongoose } = require("mongoose");
const { processPaymentWebhook } = require("../services/paymentWebhookService");
const { verifyMonriSignature } = require("../utils/monriSignature");

const monriWebhookController = async (req, res) => {
  try {
    // verifyMonriSignature(req);

    const event = req.body;

    const result = await processPaymentWebhook({
      provider: "monri",
      eventId: event.transaction.id,
      orderType: event.transaction.metadata.type, // "ticketingbookings", "userreservations", "menuorders", "tickettransfer"
      orderId: event.transaction.orderNumber || new mongoose.Types.ObjectId(),
      paymentStatus: event.transaction.status,
      paymentId: event.transaction.id,
      payload: event,
    });

    // ✅ Always return 200, but with clarity
    return res.status(200).json({
      received: true,
      processed: result.handled,
      reason: result.reason || null,
    });
  } catch (err) {
    console.error("Webhook error:", err);

    // ❌ Only reject if truly invalid
    return res.status(400).json({
      received: false,
      error: "invalid_webhook",
    });
  }
};


module.exports = { monriWebhookController };
