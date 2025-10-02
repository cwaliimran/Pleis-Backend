const express = require("express");
const {
  createMenu,
  getMenus,
  updateMenu,
  deleteMenu,
  getMenuDetails,
} = require("./menusController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Menus
const apiRateLimiter = createRateLimiter("Menus");
const apiRateLimiterDetails = createRateLimiter("Menus/:id");

// Create a new menu
router.post("/", roleMiddleware(["admin", "organizer", "manager"]), createMenu);

// Get all menus with pagination
router.get("/", apiRateLimiter, getMenus);

//get menu details
router.get("/:id", apiRateLimiterDetails, getMenuDetails);

// Update an existing menu
router.put("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), updateMenu);

// Delete a menu
router.delete("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), deleteMenu);

module.exports = router;
