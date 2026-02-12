const express = require("express");
const {
  createStreak,
  getStreaks,
  getPublicStreaks,
  updateStreak,
  deleteStreak,
} = require("./streaksController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Streaks
const apiRateLimiter = createRateLimiter("Streaks");
//public routes
router.get("/global", apiRateLimiter, getPublicStreaks);

// Create a new streak
router.post("/", roleMiddleware(["admin","organizer"]), createStreak);

// Get all streaks with pagination
router.get("/", getStreaks);

// Update an existing streak
router.put("/:id", roleMiddleware(["admin","organizer"]), updateStreak);

// Delete a streak
router.delete("/:id", roleMiddleware(["admin","organizer"]), deleteStreak);

module.exports = router;
