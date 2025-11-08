const express = require("express");
const {
  createTag,
  getTags,
  getPublicTags,
  updateTag,
  deleteTag,
} = require("./tagsController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Tags
const apiRateLimiter = createRateLimiter("Tags");

//public routes
router.get("/global", apiRateLimiter, getPublicTags);

// Create a new tag
router.post("/", roleMiddleware(["admin"]), createTag);

// Get all tags with pagination
router.get("/", getTags);

// Update an existing tag
router.put("/:id", roleMiddleware(["admin"]), updateTag);

// Delete a tag
router.delete("/:id", roleMiddleware(["admin"]), deleteTag);

module.exports = router;
