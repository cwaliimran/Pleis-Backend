/* const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const verifyStripeSignature = (req, rawBody) => {
  return stripe.webhooks.constructEvent(
    rawBody,
    req.headers["stripe-signature"],
    process.env.STRIPE_WEBHOOK_SECRET
  );
};

module.exports = { verifyStripeSignature };
 */