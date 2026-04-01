const express = require("express");
const {
  getReservationAnalytics,
  getReservationAnalyticsValue,
  getReservationAnalyticsStats,
  getReservationTransactions,
  getReservationChnageLogs
} = require("./reservationAnalyticsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for ReservationAnalyticss
const apiRateLimiter = createRateLimiter("ReservationAnalyticss");

// Get all ReservationAnalyticss with pagination
router.get("/", apiRateLimiter, getReservationAnalytics);
router.get("/analytics-transsections", apiRateLimiter, getReservationTransactions);
router.get("/change-logs", apiRateLimiter, getReservationChnageLogs);
router.get("/value", apiRateLimiter, getReservationAnalyticsValue);
router.get("/stats", apiRateLimiter, getReservationAnalyticsStats);


module.exports = router;
