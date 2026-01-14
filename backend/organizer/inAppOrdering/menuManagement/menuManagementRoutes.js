const express = require("express");
const {
  createSale,
  getMenuItems,
  getMenuItemCategories,
  getEvents,
  createMenuItemFromPreset,
  getSummary,
  updateMenu,
  deleteMenu,
  getevents,
  gettickets,
  getWinners,
  createLimitedTimeItem
} = require("./menuManagementController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const MenuRateLimiter = createRateLimiter("Menu");

router.post("/sale", roleMiddleware(["organizer"]), MenuRateLimiter, createSale);
router.get("/", roleMiddleware(["organizer"]), getSummary);
router.get("/menu-items", roleMiddleware(["organizer"]), getMenuItems);
router.get("/events", roleMiddleware(["organizer"]), getEvents);
router.get("/menu-item-categories", roleMiddleware(["organizer"]), getMenuItemCategories);
// Update an existing menuItem
router.put("/limited-time", roleMiddleware(["organizer"]), createLimitedTimeItem);
router.post("/", roleMiddleware(["organizer"]), createMenuItemFromPreset);




module.exports = router;
