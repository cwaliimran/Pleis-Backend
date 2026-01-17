const { processPaymentWebhook } = require("../services/paymentWebhookService");
const { verifyMonriSignature } = require("../utils/monriSignature");

const monriWebhookController = async (req, res) => {
  try {
    // verifyMonriSignature(req);

    const event = req.body;

    await processPaymentWebhook({
      provider: "monri",
      eventId: event.transaction.id,
      type: event.transaction.metadata.type,
      orderId: event.transaction.orderNumber,
      paymentStatus: event.transaction.status,
      paymentId: event.transaction.id,
      payload: event,
    });

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "invalid_webhook" });
  }
};

module.exports = { monriWebhookController };
