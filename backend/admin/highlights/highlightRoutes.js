const express = require("express");
const {
  createHighlight,
  getHighlights,
  updateHighlight,
  deleteHighlight,
  getHighlightDetails,
} = require("./highlightController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Highlights
const apiRateLimiter = createRateLimiter("Highlights");

// Create a new highlight
router.post("/", roleMiddleware(["organizer","admin"]), createHighlight);

// Get all highlights with pagination
router.get("/", apiRateLimiter, getHighlights);

//get highlight details
router.get("/:id", getHighlightDetails);

// Update an existing highlight
router.put("/:id", updateHighlight);

// Delete a highlight
router.delete("/:id" , deleteHighlight);

module.exports = router;
