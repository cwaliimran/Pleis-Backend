const express = require("express");
const {
  getCategories,
} = require("./globalRewardCategoriesController");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Get all categories with pagination
router.get("/", getCategories);


module.exports = router;
