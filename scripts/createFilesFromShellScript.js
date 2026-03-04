/**
 * Unified Payments Webhook Module Generator
 * - Supports Stripe / Monri / future providers
 * - Supports ticketing + reservations
 * - Safe overwrite
 */

const fs = require("fs");
const path = require("path");

/* 🔧 CHANGE THIS ONLY */
const BASE_DIR =
  "/Users/s/Deskt";

/* ============================
   Helpers
============================ */
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const write = (file, content) => {
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("✅ Created:", file);
};

ensureDir(BASE_DIR);
ensureDir(path.join(BASE_DIR, "controllers"));
ensureDir(path.join(BASE_DIR, "services"));
ensureDir(path.join(BASE_DIR, "repositories"));
ensureDir(path.join(BASE_DIR, "routes"));
ensureDir(path.join(BASE_DIR, "utils"));

/* ============================
   WebhookEvent.model.js
============================ */
write(
  path.join(BASE_DIR, "repositories", "WebhookEvent.model.js"),
  `
const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, required: true }, // stripe | monri
    eventId: { type: String, required: true },
    type: { type: String, enum: ["ticketing", "reservation"], required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    payload: Object,
  },
  { timestamps: true }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
`
);

/* ============================
   webhookRepository.js
============================ */
write(
  path.join(BASE_DIR, "repositories", "webhookRepository.js"),
  `
const WebhookEvent = require("./WebhookEvent.model");

const saveIfNotProcessed = async (data) => {
  try {
    return await WebhookEvent.create(data);
  } catch (err) {
    if (err.code === 11000) return null; // already processed
    throw err;
  }
};

module.exports = { saveIfNotProcessed };
`
);

/* ============================
   paymentWebhookService.js
============================ */
write(
  path.join(BASE_DIR, "services", "paymentWebhookService.js"),
  `
const { saveIfNotProcessed } = require("../repositories/webhookRepository");
const { ticketingOrderFinalizerService } =
  require("../orderFinalizers/ticketingOrderFinalizerService");
const { reservationOrderFinalizerService } =
  require("../orderFinalizers/reservationOrderFinalizerService");

const processPaymentWebhook = async ({
  provider,
  eventId,
  type,
  orderId,
  paymentStatus,
  paymentId,
  payload,
}) => {
  const event = await saveIfNotProcessed({
    provider,
    eventId,
    type,
    orderId,
    payload,
  });

  if (!event) return; // idempotent exit

  const result = {
    status: paymentStatus,
    paymentId,
  };

  if (type === "ticketing") {
    await ticketingOrderFinalizerService({ orderId, result });
  }

  if (type === "reservation") {
    await reservationOrderFinalizerService({ reservationId: orderId, result });
  }
};

module.exports = { processPaymentWebhook };
`
);

/* ============================
   monriSignature.js
============================ */
write(
  path.join(BASE_DIR, "utils", "monriSignature.js"),
  `
const crypto = require("crypto");

const verifyMonriSignature = (req) => {
  const signature = req.headers["x-monri-signature"];
  const payload = JSON.stringify(req.body);

  const expected = crypto
    .createHmac("sha256", process.env.MONRI_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  if (signature !== expected) {
    throw new Error("invalid_monri_signature");
  }
};

module.exports = { verifyMonriSignature };
`
);

/* ============================
   stripeSignature.js
============================ */
write(
  path.join(BASE_DIR, "utils", "stripeSignature.js"),
  `
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const verifyStripeSignature = (req, rawBody) => {
  return stripe.webhooks.constructEvent(
    rawBody,
    req.headers["stripe-signature"],
    process.env.STRIPE_WEBHOOK_SECRET
  );
};

module.exports = { verifyStripeSignature };
`
);

/* ============================
   monriWebhookController.js
============================ */
write(
  path.join(BASE_DIR, "controllers", "monriWebhookController.js"),
  `
const { processPaymentWebhook } = require("../services/paymentWebhookService");
const { verifyMonriSignature } = require("../utils/monriSignature");

const monriWebhookController = async (req, res) => {
  try {
    verifyMonriSignature(req);

    const event = req.body;

    await processPaymentWebhook({
      provider: "monri",
      eventId: event.transaction.id,
      type: event.transaction.metadata.type,
      orderId: event.transaction.order_number,
      paymentStatus:
        event.transaction.status === "approved" ? "paid" : "failed",
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
`
);

/* ============================
   stripeWebhookController.js
============================ */
write(
  path.join(BASE_DIR, "controllers", "stripeWebhookController.js"),
  `
const { processPaymentWebhook } = require("../services/paymentWebhookService");
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
`
);

/* ============================
   webhookRoutes.js
============================ */
write(
  path.join(BASE_DIR, "routes", "webhookRoutes.js"),
  `
const express = require("express");
const router = express.Router();

const { monriWebhookController } =
  require("../controllers/monriWebhookController");
const { stripeWebhookController } =
  require("../controllers/stripeWebhookController");

router.post("/monri", express.json({ type: "*/*" }), monriWebhookController);
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhookController
);

module.exports = router;
`
);

/* ============================
   index.js
============================ */
write(
  path.join(BASE_DIR, "index.js"),
  `
module.exports = {
  routes: require("./routes/webhookRoutes"),
};
`
);

console.log("\\n🎉 Unified Payments Webhook module created successfully");
