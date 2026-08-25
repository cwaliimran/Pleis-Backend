const express = require("express");
const {
  createBrand,
  getBrands,
  updateBrand,
  deleteBrand,
} = require("./brandController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const BrandRateLimiter = createRateLimiter("Brands");

// Routes for Promo Code Management
// Create a new Promo Code
router.post("/", roleMiddleware(["admin"]), BrandRateLimiter, createBrand);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin","organizer"]), BrandRateLimiter, getBrands);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updateBrand);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteBrand);

module.exports = router;
