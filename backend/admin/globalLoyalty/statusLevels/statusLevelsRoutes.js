const express = require("express");
const {
  createStatusLevel,
  getStatusLevels,
  updateStatusLevel,
  deleteStatusLevel,
  getStatusLevelDetails,
  getTitleStatusLevels,
} = require("./statusLevelsController");
const createRateLimiter = require("@utils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for StatusLevels
const apiRateLimiter = createRateLimiter("StatusLevels");
const apiRateLimiterDetails = createRateLimiter("StatusLevels/:id");

// Create a new statusLevel
router.post("/", roleMiddleware(["admin"]), createStatusLevel);

// Get all statusLevels with pagination
router.get("/", apiRateLimiter, getStatusLevels);
router.get("/title", apiRateLimiter, getTitleStatusLevels);

//get statusLevel details
router.get("/:id", apiRateLimiterDetails, getStatusLevelDetails);

// Update an existing statusLevel
router.put("/:id", roleMiddleware(["admin"]), updateStatusLevel);

// Delete a statusLevel
router.delete("/:id", roleMiddleware(["admin"]), deleteStatusLevel);

module.exports = router;
