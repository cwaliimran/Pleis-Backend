const express = require("express");
const {
  getBannerControls,
} = require("./bannerControlsController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for BannerControls
const apiRateLimiter = createRateLimiter("BannerControls");

// Get all bannerControls with pagination
router.get("/", apiRateLimiter, getBannerControls);

module.exports = router;
