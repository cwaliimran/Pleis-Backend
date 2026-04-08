const express = require("express");
const {
  getReferralAnalytics,
  getReferralAnalyticsValue,
  getReferralAnalyticsStats
} = require("./referralAnalyticsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for ReferralAnalyticss
const apiRateLimiter = createRateLimiter("ReferralAnalyticss");

// Get all ReferralAnalyticss with pagination
router.get("/", apiRateLimiter, getReferralAnalytics);
router.get("/value", apiRateLimiter, getReferralAnalyticsValue);
router.get("/stats", apiRateLimiter, getReferralAnalyticsStats);


module.exports = router;
