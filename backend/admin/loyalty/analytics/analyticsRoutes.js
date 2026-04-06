const express = require("express");
const {
  getAnalytics,
  getAnalyticsValue,
  getAnalyticsStats,
  getTransactions,
  getsummary
} = require("./analyticsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Analyticss
const apiRateLimiter = createRateLimiter("Analyticss");

// Get all Analyticss with pagination
router.get("/", apiRateLimiter, getAnalytics);
router.get("/analytics-transsections", apiRateLimiter, getTransactions);
router.get("/summary", apiRateLimiter, getsummary);
router.get("/value", apiRateLimiter, getAnalyticsValue);
router.get("/stats", apiRateLimiter, getAnalyticsStats);


module.exports = router;
