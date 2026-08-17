const express = require("express");
const {
  createMenuItemSubCategory,
  getMenuItemSubCategorys,
  getMenuItemSubCategoryCode,
  updateMenuItemSubCategory,
  deleteMenuItemSubCategory,
  reorderMenuItemSubCategory,
} = require("./menuItemSubCategoriesController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Diet Tags
const MenuItemSubCategoryRateLimiter = createRateLimiter("MenuItemSubCategory");


router.get(
  "/",
  roleMiddleware(["admin"]),
  MenuItemSubCategoryRateLimiter,
  getMenuItemSubCategorys,
);
router.post("/", roleMiddleware(["admin"]), MenuItemSubCategoryRateLimiter, createMenuItemSubCategory);

// Get all Promo Codes with pagination

router.get("/code", roleMiddleware(["admin"]), MenuItemSubCategoryRateLimiter, getMenuItemSubCategoryCode);


router.put("/order/:id", roleMiddleware(["admin"]), reorderMenuItemSubCategory);
router.put("/:id", roleMiddleware(["admin"]), updateMenuItemSubCategory);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteMenuItemSubCategory);

module.exports = router;
