const express = require("express");
const {
  createServing,
  getServings,
  getServingCode,
  updateServing,
  deleteServing,
} = require("./servingController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const ServingRateLimiter = createRateLimiter("Servings");

// Routes for Promo Code Management
// Create a new Promo Code
router.post("/", roleMiddleware(["admin"]), ServingRateLimiter, createServing);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin"]), ServingRateLimiter, getServings);
router.get("/code", roleMiddleware(["admin"]), ServingRateLimiter, getServingCode);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updateServing);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteServing);

module.exports = router;
