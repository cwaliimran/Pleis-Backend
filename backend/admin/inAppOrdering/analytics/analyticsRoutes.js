const express = require("express");
const {
  getAnalytics,
  getAnalyticsValue,
  getAnalyticsStats,
  getReservationTransactions,
  getReservationChnageLogs,
  getMenuItemSalesData
} = require("./analyticsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

// Mounted under /admin and /organizer; the organizer mount has no role check
// of its own. Scope per role is enforced by resolveAnalyticsScope.
router.use(auth, roleMiddleware(["admin", "organizer"]));
// Platform-wide figures (no company scope): super admin only.
const superAdminOnly = roleMiddleware(["admin"]);

// Create a rate limiter for Analyticss
const apiRateLimiter = createRateLimiter("Analyticss");

// Get all Analyticss with pagination
router.get("/", apiRateLimiter, getAnalytics);
router.get("/analytics-transsections", apiRateLimiter, getReservationTransactions);
router.get("/chnage-logs", apiRateLimiter, getReservationChnageLogs);
router.get("/menu-item-performance", apiRateLimiter, getMenuItemSalesData);
router.get("/value", superAdminOnly, apiRateLimiter, getAnalyticsValue);
router.get("/stats", superAdminOnly, apiRateLimiter, getAnalyticsStats);


module.exports = router;
