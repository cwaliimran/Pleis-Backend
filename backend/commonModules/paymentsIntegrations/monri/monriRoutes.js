const express = require("express");
const {
  redirectToMonriWebPay,
  redirectToMonriWalletPay,
  handleSuccess,
  handleCancel,
  createClientSecret,
  createWebPaySession,
  createSubscriptionWebPaySession,
} = require("./monriController");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();
//webpay
router.get("/web-pay-session", auth, createWebPaySession);
router.post("/subscription-web-pay-session", auth, createSubscriptionWebPaySession);

router.get("/redirect", redirectToMonriWebPay);
router.get("/wallet-pay", redirectToMonriWalletPay);
router.post("/payment-intent", createClientSecret);


// Monri browser redirect (GET) + merchant callback / form POST
router.post("/success", handleSuccess);
router.get("/success", handleSuccess);

router.post("/cancel", handleCancel);
router.get("/cancel", handleCancel);


module.exports = router;
