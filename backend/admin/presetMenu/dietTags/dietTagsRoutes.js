const express = require("express");
const {
  createDietTags,
  getDietTagss,
  getDietTagsCode,
  updateDietTags,
  deleteDietTags,
} = require("./dietTagsController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Diet Tags
const DietTagsRateLimiter = createRateLimiter("DietTags");

// Routes for Diet Tags Management
// Create a new Diet Tag
router.post("/", roleMiddleware(["admin"]), DietTagsRateLimiter, createDietTags);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin","organizer"]), DietTagsRateLimiter, getDietTagss);
router.get("/code", roleMiddleware(["admin"]), DietTagsRateLimiter, getDietTagsCode);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updateDietTags);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteDietTags);

module.exports = router;
