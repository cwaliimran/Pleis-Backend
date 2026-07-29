const express = require("express");
const {
  getMenuItems,
  getMenuItemsV2,
  getRecommendedMenuItems,
  getRecommendedMenuItemsV2,
  getUpsellMenuItemsV2,
  getMenuItemDetails,
  getPickupOptions,
} = require("./menuItemsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for MenuItems
const apiRateLimiter = createRateLimiter("MenuItems");
const apiRateLimiterDetails = createRateLimiter("MenuItems/:id");


// Get all menuItems with pagination
router.get("/", apiRateLimiter, getMenuItems);
router.get("/v2", apiRateLimiter, getMenuItemsV2);
router.get("/recommended", apiRateLimiter, getRecommendedMenuItems);
router.get("/recommended-v2", apiRateLimiter, getRecommendedMenuItemsV2);
router.get("/upsell-v2", apiRateLimiter, getUpsellMenuItemsV2);
router.get("/pickup-options/:id", apiRateLimiter, getPickupOptions);

//get menuItem details
router.get("/:id", apiRateLimiterDetails, getMenuItemDetails);

module.exports = router;
