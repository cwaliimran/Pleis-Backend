const express = require("express");
const {
  createPinnedContent,
  getPinnedContent,
  updatePinnedContent,
  deletePinnedContent,
  reorderPinnedContent,
} = require("./pinnedContentController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for PinnedContent
const apiRateLimiter = createRateLimiter("PinnedContent");

// Create a new pinnedContent
router.post("/", roleMiddleware(["admin"]), createPinnedContent);

// Get all pinnedContent with pagination
router.get("/", apiRateLimiter, getPinnedContent);

// Update an existing pinnedContent
router.put("/:id", roleMiddleware(["admin"]), updatePinnedContent);

// Delete a pinnedContent
router.delete("/:id", roleMiddleware(["admin"]), deletePinnedContent);

// Reorder pinnedContent
router.post("/reorder", roleMiddleware(["admin"]), reorderPinnedContent);

module.exports = router;
