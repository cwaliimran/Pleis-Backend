const express = require("express");
const {
  createCustomCategory,
  getCustomCategories,
  updateCustomCategory,
  deleteCustomCategory,
  reorderCustomCategory,
} = require("./customCategoriesController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for CustomCategories
const apiRateLimiter = createRateLimiter("CustomCategories");

// Create a new customCategory
router.post("/", roleMiddleware(["admin"]), createCustomCategory);

// Get all customCategories with pagination
router.get("/", apiRateLimiter, getCustomCategories);

// Update an existing customCategory
router.put("/:id", roleMiddleware(["admin"]), updateCustomCategory);

// Delete a customCategory
router.delete("/:id", roleMiddleware(["admin"]), deleteCustomCategory);

// Reorder customCategories
router.post("/reorder", roleMiddleware(["admin"]), reorderCustomCategory);

module.exports = router;
