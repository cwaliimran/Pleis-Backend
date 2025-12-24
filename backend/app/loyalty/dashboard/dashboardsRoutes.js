const express = require("express");
const {
  get,
} = require("./dashboardsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("LoyaltyDashboard");

router.get("/", apiRateLimiter, get);

module.exports = router;
