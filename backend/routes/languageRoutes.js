const express = require("express");
const {
  createLanguage,
  getLanguages,
  updateLanguage,
  deleteLanguage,
  updateUserLanguage,
} = require("../controllers/languageController");
const admin = require("../middlewares/adminMiddleware");
const auth = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(auth);

// Create a new language
router.post("/", admin, createLanguage);

// Get all languages with pagination
router.get("/", getLanguages);

// Update user's preferred language
router.put("/user", updateUserLanguage);

// Update an existing language
router.put("/:id", admin, updateLanguage);

// Delete a language
router.delete("/:id", admin, deleteLanguage);

module.exports = router;
