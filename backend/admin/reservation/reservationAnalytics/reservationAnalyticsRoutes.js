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

// Mounted under /admin and /organizer; the organizer mount has no role check
// of its own. Scope per role is enforced by resolveAnalyticsScope.
router.use(auth, roleMiddleware(["admin", "organizer"]));
// Platform-wide figures (no company scope): super admin only.
const superAdminOnly = roleMiddleware(["admin"]);

// Create a rate limiter for ReservationAnalyticss
const apiRateLimiter = createRateLimiter("ReservationAnalyticss");

// Get all ReservationAnalyticss with pagination
router.get("/", apiRateLimiter, getReservationAnalytics);
router.get("/analytics-transsections", apiRateLimiter, getReservationTransactions);
router.get("/change-logs", apiRateLimiter, getReservationChnageLogs);
router.get("/value", superAdminOnly, apiRateLimiter, getReservationAnalyticsValue);
router.get("/stats", superAdminOnly, apiRateLimiter, getReservationAnalyticsStats);


module.exports = router;
