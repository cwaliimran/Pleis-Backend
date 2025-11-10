const express = require("express");
const {
  createMenuItem,
  getMenuItems,
  updateMenuItem,
  deleteMenuItem,
  getMenuItemDetails,
} = require("./menuItemsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for MenuItems
const apiRateLimiter = createRateLimiter("MenuItems");
const apiRateLimiterDetails = createRateLimiter("MenuItems/:id");

// Create a new menuItem
router.post("/", roleMiddleware(["admin", "organizer", "staff", "manager"]), createMenuItem);

// Get all menuItems with pagination
router.get("/", apiRateLimiter, getMenuItems);

//get menuItem details
router.get("/:id", apiRateLimiterDetails, getMenuItemDetails);

// Update an existing menuItem
router.put("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), updateMenuItem);

// Delete a menuItem
router.delete("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), deleteMenuItem);


module.exports = router;
