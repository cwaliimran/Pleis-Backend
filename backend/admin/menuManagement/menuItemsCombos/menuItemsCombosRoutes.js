const express = require("express");
const {
  createMenuItemsCombo,
  getMenuItemsCombos,
  getMenuItemsComboDetails,
  updateMenuItemsCombo,
  deleteMenuItemsCombo,
} = require("./menuItemsCombosController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("MenuItemsCombos");
const apiRateLimiterDetails = createRateLimiter("MenuItemsCombos/:id");

router.post(
  "/",
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  createMenuItemsCombo,
);

router.get("/", apiRateLimiter, getMenuItemsCombos);
router.get("/:id", apiRateLimiterDetails, getMenuItemsComboDetails);

router.put(
  "/:id",
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  updateMenuItemsCombo,
);

router.delete(
  "/:id",
  roleMiddleware(["admin", "organizer", "staff", "manager"]),
  deleteMenuItemsCombo,
);

module.exports = router;
