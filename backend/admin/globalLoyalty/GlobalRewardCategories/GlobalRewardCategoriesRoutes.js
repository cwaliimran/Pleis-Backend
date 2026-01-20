const express = require("express");
const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoriesTitleOnly
} = require("./globalRewardCategoriesController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);


// Create a new category
router.post("/", roleMiddleware(["admin"]), createCategory);

// Get all categories with pagination
router.get("/", getCategories);
router.get("/summary", getCategoriesTitleOnly);

// Update an existing category
router.put("/:id", roleMiddleware(["admin"]), updateCategory);

// Delete a category
router.delete("/:id", roleMiddleware(["admin"]), deleteCategory);

module.exports = router;
