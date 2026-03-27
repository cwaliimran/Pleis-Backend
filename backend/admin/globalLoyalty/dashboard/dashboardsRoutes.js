const express = require("express");
const {
  getDashboard,
  getDashboardValue,
  getDashboardStats
} = require("./dashboardsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Dashboards
const apiRateLimiter = createRateLimiter("Dashboards");

// Get all dashboards with pagination
router.get("/", apiRateLimiter, getDashboard);
router.get("/value", apiRateLimiter, getDashboardValue);
router.get("/stats", apiRateLimiter, getDashboardStats);


module.exports = router;
