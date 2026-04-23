const express = require("express");
const {
  redirectToMonriWebPay,
  redirectToMonriWalletPay,
  handleSuccess,
  handleCancel,
  createClientSecret,
  createWebPaySession
} = require("./monriController");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();
//webpay
router.get("/web-pay-session", auth, createWebPaySession);

router.get("/redirect", redirectToMonriWebPay);
router.get("/wallet-pay", redirectToMonriWalletPay);
router.post("/payment-intent", createClientSecret);


// Monri will call these on payment success / cancel
router.post("/success", handleSuccess);
router.get("/success", handleSuccess);

router.post("/cancel", handleCancel);
router.get("/cancel", handleCancel);


module.exports = router;
