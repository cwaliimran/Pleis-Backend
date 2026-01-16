const express = require("express");
const {
  getDashboard,
  getDashboardStats
} = require("./dashboardsController");
const createRateLimiter = require("@utils/rateLimiter");

const router = express.Router();

// Create a rate limiter for Dashboards
const apiRateLimiter = createRateLimiter("Dashboards");

// Get all dashboards with pagination
router.get("/", apiRateLimiter, getDashboard);
router.get("/stats", apiRateLimiter, getDashboardStats);


module.exports = router;
