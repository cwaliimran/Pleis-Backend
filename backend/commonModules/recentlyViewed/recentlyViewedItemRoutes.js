const express = require("express");
const {
  addOrUpdateRecentlyViewedItem,
  getUserRecentlyViewedItems,
  isRecentlyViewedItemd,
} = require("./recentlyViewedItemController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for RecentlyViewedItems
const apiRateLimiter = createRateLimiter("RecentlyViewedItems");

/**
 * @route POST /api/v1/recentlyViewedItems
 * @desc Add or update a recently viewed item (idempotent)
 * @access Authenticated users
 */
router.post("/", apiRateLimiter, addOrUpdateRecentlyViewedItem);

/**
 * @route GET /api/v1/recentlyViewedItems
 * @desc Get user's recently viewed items (paginated)
 * @access Authenticated users
 */
router.get("/", apiRateLimiter, getUserRecentlyViewedItems);

/**
 * @route GET /api/v1/recentlyViewedItems/:targetType/:targetId/status
 * @desc Check if the logged-in user has recently viewed a specific item
 * @access Authenticated users
 */
router.get("/:targetType/:targetId/status", apiRateLimiter, isRecentlyViewedItemd);

module.exports = router;
