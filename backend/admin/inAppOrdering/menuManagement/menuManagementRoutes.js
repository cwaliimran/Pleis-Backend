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
  getSaleItems,
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

router.post("/sale", roleMiddleware(["admin"]), MenuRateLimiter, createSale);
router.get("/", roleMiddleware(["admin"]), getSummary);
router.get("/sale", roleMiddleware(["admin"]), getSaleItems);
router.get("/menu-items", roleMiddleware(["admin"]), getMenuItems);
router.get("/events", roleMiddleware(["admin"]), getEvents);
router.get("/menu-item-categories", roleMiddleware(["admin"]), getMenuItemCategories);
// Update an existing menuItem
router.put("/limited-time", roleMiddleware(["admin"]), createLimitedTimeItem);
router.post("/", roleMiddleware(["admin"]), createMenuItemFromPreset);




module.exports = router;
