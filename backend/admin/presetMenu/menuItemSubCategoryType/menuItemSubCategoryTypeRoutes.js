const express = require("express");
const {
  createMenuItemSubCategoryType,
  getMenuItemSubCategoryTypes,
  getMenuItemSubCategoryTypeCode,
  updateMenuItemSubCategoryType,
  deleteMenuItemSubCategoryType,
  reorderMenuItemSubCategoryType,
} = require("./menuItemSubCategoryTypeController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Diet Tags
const MenuItemSubCategoryTypeRateLimiter = createRateLimiter("MenuItemSubCategoryType");


router.get(
  "/",
  roleMiddleware(["admin"]),
  MenuItemSubCategoryTypeRateLimiter,
  getMenuItemSubCategoryTypes,
);
router.post("/", roleMiddleware(["admin"]), MenuItemSubCategoryTypeRateLimiter, createMenuItemSubCategoryType);

// Get all Promo Codes with pagination

router.get("/code", roleMiddleware(["admin"]), MenuItemSubCategoryTypeRateLimiter, getMenuItemSubCategoryTypeCode);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updateMenuItemSubCategoryType);
router.put("/order/:id", roleMiddleware(["admin"]), reorderMenuItemSubCategoryType);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteMenuItemSubCategoryType);

module.exports = router;
