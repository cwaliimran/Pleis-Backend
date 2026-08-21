const express = require("express");
const {
  getMenuItems,
  getMenuItemsV2,
  getMenuItemDetails,
  getMenuItemsToManage,
  updateMenuStock,
  updateMenuItem,
} = require("./menuItemsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for MenuItems
const apiRateLimiter = createRateLimiter("MenuItems");
const apiRateLimiterDetails = createRateLimiter("MenuItems/:id");

// Get all menuItems with pagination only active items
//this returns all menu items for management purpose
router.post("/manage/stock-update", apiRateLimiter, updateMenuStock);
router.post("/:id/manage", apiRateLimiter, updateMenuItem);
router.get("/manage", apiRateLimiter, getMenuItemsToManage);
router.get("/v2", apiRateLimiter, getMenuItemsV2);
router.get("/", apiRateLimiter, getMenuItems);
//get menuItem details
router.get("/:id", apiRateLimiterDetails, getMenuItemDetails);

module.exports = router;
