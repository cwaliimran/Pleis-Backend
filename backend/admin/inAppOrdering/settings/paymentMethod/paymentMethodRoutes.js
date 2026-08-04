const express = require("express");
const {
  createPaymentMethod,
  getPaymentMethods,
  getPaymentMethodCode,
  updatePaymentMethod,
  deletePaymentMethod,
} = require("./paymentMethodController"); // Assuming you have a separate controller for promo codes


const createRateLimiter = require("@utils/rateLimiter");
const roleMiddleware = require("../../../../middlewares/roleMiddleware");
const auth = require("../../../../middlewares/authMiddleware");

const router = express.Router();


router.use(auth);

// Create a rate limiter for Diet Tags
const PaymentMethodRateLimiter = createRateLimiter("PaymentMethod");
router.get("/", roleMiddleware(["admin"]), PaymentMethodRateLimiter, getPaymentMethods);
router.put("/:id", roleMiddleware(["admin"]), updatePaymentMethod);


module.exports = router;
