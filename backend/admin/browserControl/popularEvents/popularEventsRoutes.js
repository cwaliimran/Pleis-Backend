const express = require("express");
const {
  createPopularEvent,
  getPopularEvents,
  updatePopularEvent,
  deletePopularEvent,
  reorderPopularEvent,
} = require("./popularEventsController");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);
router.use(roleMiddleware(["admin"]));

// Create a new popularEvent
router.post("/", createPopularEvent);

// Get all popularEvents with pagination
router.get("/", getPopularEvents);

// Update an existing popularEvent
router.put("/:id", updatePopularEvent);

// Delete a popularEvent
router.delete("/:id", deletePopularEvent);

// Reorder popularEvents
router.post("/reorder", reorderPopularEvent);

module.exports = router;
