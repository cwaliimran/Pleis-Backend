const express = require("express");
const {
  createSale,
  getMenuItems,
  getMenuItemCategories,
  getEvents,
  createMenuItemFromPreset,
  getSummary,
  updateMenu,
  updateSaleItems,
  getSaleItems,
  deleteSaleItems,
  createLimitedTimeItem
} = require("./menuManagementController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const MenuRateLimiter = createRateLimiter("Menu");

router.post("/sale", roleMiddleware(["admin","organizer"]), MenuRateLimiter, createSale);
router.get("/", roleMiddleware(["admin","organizer"]), getSummary);
router.get("/sale", roleMiddleware(["admin","organizer"]), getSaleItems);
router.put("/sale/:id", roleMiddleware(["admin","organizer"]), updateSaleItems);
router.delete("/sale/:id", roleMiddleware(["admin","organizer"]), deleteSaleItems);
router.get("/menu-items", roleMiddleware(["admin","organizer"]), getMenuItems);
router.get("/events", roleMiddleware(["admin","organizer"]), getEvents);
router.get("/menu-item-categories", roleMiddleware(["admin","organizer"]), getMenuItemCategories);
// Update an existing menuItem
router.put("/limited-time", roleMiddleware(["admin","organizer"]), createLimitedTimeItem);
router.post("/", roleMiddleware(["admin","organizer"]), createMenuItemFromPreset);




module.exports = router;
