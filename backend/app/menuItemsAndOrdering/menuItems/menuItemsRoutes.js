const express = require("express");
const {
  getMenuItems,
  getMenuItemDetails,
  getPickupOptions
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
router.get("/pickup-options/:id", apiRateLimiter, getPickupOptions);

//get menuItem details
router.get("/:id", apiRateLimiterDetails, getMenuItemDetails);

module.exports = router;
