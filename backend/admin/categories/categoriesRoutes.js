const express = require("express");
const {
  createCategory,
  getCategories,
  getPublicCategories,
  updateCategory,
  deleteCategory,
} = require("./categoriesController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const admin = require("../../middlewares/adminMiddleware");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

//public routes
router.get("/public", getPublicCategories);

router.use(auth);

// Create a rate limiter for Categories
const apiRateLimiter = createRateLimiter("Categories");

// Create a new category
router.post("/", admin, createCategory);

// Get all categories with pagination
router.get("/", apiRateLimiter, getCategories);

// Update an existing category
router.put("/:id", admin, updateCategory);

// Delete a category
router.delete("/:id", admin, deleteCategory);

module.exports = router;
