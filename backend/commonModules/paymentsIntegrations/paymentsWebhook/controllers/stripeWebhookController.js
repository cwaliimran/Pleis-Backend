/* const { processPaymentWebhook } = require("../services/paymentWebhookService");
const { verifyStripeSignature } = require("../utils/stripeSignature");

const stripeWebhookController = async (req, res) => {
  let event;

  try {
    event = verifyStripeSignature(req, req.rawBody);
  } catch (err) {
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;

    await processPaymentWebhook({
      provider: "stripe",
      eventId: intent.id,
      type: intent.metadata.type,
      orderId: intent.metadata.orderId,
      paymentStatus: "paid",
      paymentId: intent.id,
      payload: event,
    });
  }

  res.json({ received: true });
};

module.exports = { stripeWebhookController };
 */