const express = require("express");
const router = express.Router();

const { monriWebhookController } =
  require("../controllers/monriWebhookController");
// const { stripeWebhookController } =
//   require("../controllers/stripeWebhookController");

router.post("/payments/monri", express.json({ type: "*/*" }), monriWebhookController);
// router.post(
//   "payments/stripe",
//   express.raw({ type: "application/json" }),
//   stripeWebhookController
// );

module.exports = router;
