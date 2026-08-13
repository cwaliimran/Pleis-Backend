const express = require("express");
const {
  getStreaks,
  getPublicStreaks,
  updateStreak
} = require("./streaksController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();
router.use(auth);

const apiRateLimiter = createRateLimiter("Streaks");
//public routes
router.get("/global", apiRateLimiter, getPublicStreaks);
router.get("/", getStreaks);
router.put("/", roleMiddleware(["admin","organizer"]), updateStreak);

module.exports = router;
