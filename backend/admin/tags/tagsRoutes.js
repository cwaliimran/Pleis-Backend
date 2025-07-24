const express = require("express");
const {
  createTag,
  getTags,
  getPublicTags,
  updateTag,
  deleteTag,
} = require("./tagsController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const admin = require("../../middlewares/adminMiddleware");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

//public routes
router.get("/public", getPublicTags);

router.use(auth);

// Create a rate limiter for Tags
const apiRateLimiter = createRateLimiter("Tags");

// Create a new tag
router.post("/", admin, createTag);

// Get all tags with pagination
router.get("/", apiRateLimiter, getTags);

// Update an existing tag
router.put("/:id", admin, updateTag);

// Delete a tag
router.delete("/:id", admin, deleteTag);

module.exports = router;
