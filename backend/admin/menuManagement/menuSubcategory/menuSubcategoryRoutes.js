const express = require("express");
const {
  createMenuSubcategory,
  getMenuSubcategorys,
  updateMenuSubcategory,
  deleteMenuSubcategory,
  reorderMenuSubCategory,
} = require("./menuSubcategoryController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Menu Subcategories
const MenuSubcategoryRateLimiter = createRateLimiter("MenuSubcategorys");

// Routes for Menu Subcategory Management
// Create a new Menu Subcategory
router.post("/", roleMiddleware(["admin", "organizer"]), MenuSubcategoryRateLimiter, createMenuSubcategory);

// Get all Menu Subcategories with pagination
router.get("/", roleMiddleware(["admin", "organizer"]), MenuSubcategoryRateLimiter, getMenuSubcategorys);


// Update an existing Menu Subcategory
router.put("/:id", roleMiddleware(["admin", "organizer"]), MenuSubcategoryRateLimiter, updateMenuSubcategory);
router.put("/order/:id", roleMiddleware(["admin"]), reorderMenuSubCategory);

// Delete a Menu Subcategory
router.delete("/:id", roleMiddleware(["admin", "organizer"]), MenuSubcategoryRateLimiter, deleteMenuSubcategory);

module.exports = router;
