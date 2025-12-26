const express = require("express");
const {
  createBadgeCategories,
  getBadgeCategoriess,
  updateBadgeCategories,
  deleteBadgeCategories,
} = require("./badgeCategoriesController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const BadgeCategoriesRateLimiter = createRateLimiter("BadgeCategoriess");

// Routes for Promo Code Management
// Create a new Promo Code
router.post("/", roleMiddleware(["admin"]), BadgeCategoriesRateLimiter, createBadgeCategories);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin"]), BadgeCategoriesRateLimiter, getBadgeCategoriess);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updateBadgeCategories);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteBadgeCategories);

module.exports = router;
