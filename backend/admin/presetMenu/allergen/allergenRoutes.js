const express = require("express");
const {
  createAllergen,
  getAllergens,
  getAllergenCode,
  updateAllergen,
  deleteAllergen,
} = require("./allergenController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Diet Tags
const AllergenRateLimiter = createRateLimiter("Allergen");

// Routes for Diet Tags Management
// Create a new Diet Tag
router.post("/", roleMiddleware(["admin"]), AllergenRateLimiter, createAllergen);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin","organizer"]), AllergenRateLimiter, getAllergens);
router.get("/code", roleMiddleware(["admin"]), AllergenRateLimiter, getAllergenCode);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updateAllergen);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteAllergen);

module.exports = router;
