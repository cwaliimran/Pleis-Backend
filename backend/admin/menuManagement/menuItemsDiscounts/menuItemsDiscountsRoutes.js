const express = require("express");
const {
  createMenuItemsDiscount,
  getMenuItemsDiscounts,
  getMenuItemsDiscountDetails,
  updateMenuItemsDiscount,
  deleteMenuItemsDiscount,
} = require("./menuItemsDiscountsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("MenuItemsDiscounts");
const apiRateLimiterDetails = createRateLimiter("MenuItemsDiscounts/:id");

router.post(
  "/",
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  createMenuItemsDiscount,
);

router.get("/", apiRateLimiter, getMenuItemsDiscounts);
router.get("/:id", apiRateLimiterDetails, getMenuItemsDiscountDetails);

router.put(
  "/:id",
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  updateMenuItemsDiscount,
);

router.delete(
  "/:id",
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  deleteMenuItemsDiscount,
);

module.exports = router;
