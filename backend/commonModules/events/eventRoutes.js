const express = require("express");
const {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
  getEventDetails,
  cloneEvent,
} = require("./eventController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Events
const apiRateLimiter = createRateLimiter("Events");

// Create a new event
router.post("/", roleMiddleware(["organizer","admin"]), createEvent);

// Get all events with pagination
router.get("/", apiRateLimiter, getEvents);

//get event details
router.get("/:id", getEventDetails);

// Update an existing event
router.put("/:id", updateEvent);

// Delete a event
router.delete("/:id" , deleteEvent);

// Clone an existing event
router.post("/:id/clone", roleMiddleware(["organizer","admin"]), cloneEvent);

module.exports = router;
