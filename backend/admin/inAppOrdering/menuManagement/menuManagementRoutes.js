const express = require("express");
const {
  createMenu,
  getMenuItems,
  getMenuItemCategories,
  getEvents,
  updateMenu,
  deleteMenu,
  getevents,
  gettickets,
  getWinners,
} = require("./menuManagementController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const MenuRateLimiter = createRateLimiter("Menu");

// router.post("/", roleMiddleware(["admin"]), MenuRateLimiter, createMenu);
router.get("/menu-items", roleMiddleware(["admin"]), getMenuItems);
router.get("/events", roleMiddleware(["admin"]), getEvents);
router.get("/menu-item-categories", roleMiddleware(["admin"]), getMenuItemCategories);




module.exports = router;
