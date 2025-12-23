const express = require("express");
const {
  getStatusLevels,
} = require("./globalStatusLevelsController");
const createRateLimiter = require("@utils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for StatusLevels
const apiRateLimiter = createRateLimiter("GlobalStatusLevels");

// Get all statusLevels with pagination
router.get("/", apiRateLimiter, getStatusLevels);

module.exports = router;
