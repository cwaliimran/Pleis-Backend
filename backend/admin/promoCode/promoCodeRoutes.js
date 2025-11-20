const express = require("express");
const {
  createPromoCode,
  getPromoCodes,
  updatePromoCode,
  deletePromoCode,
} = require("./promoCodeController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const promoCodeRateLimiter = createRateLimiter("PromoCodes");

// Routes for Promo Code Management
// Create a new Promo Code
router.post("/", roleMiddleware(["admin"]), promoCodeRateLimiter, createPromoCode);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin"]), promoCodeRateLimiter, getPromoCodes);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updatePromoCode);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deletePromoCode);

module.exports = router;
