const express = require("express");
const {
  createTier,
  getTiers,
  updateTier,
  deleteTier,
  getTierDetails,
} = require("./tiersController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Tiers
const apiRateLimiter = createRateLimiter("Tiers");
const apiRateLimiterDetails = createRateLimiter("Tiers/:id");

// Create a new tier
router.post("/", roleMiddleware(["admin"]), createTier);

// Get all tiers with pagination
router.get("/", apiRateLimiter, getTiers);

//get tier details
router.get("/:id", apiRateLimiterDetails, getTierDetails);

// Update an existing tier
router.put("/:id", roleMiddleware(["admin"]), updateTier);

// Delete a tier
router.delete("/:id", roleMiddleware(["admin"]), deleteTier);

module.exports = router;
