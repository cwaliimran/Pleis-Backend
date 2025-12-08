const express = require("express");
const {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
  getEventDetails,
  cloneEvent,
  getMinimalEventsInfo,
  getEventTicketings,
} = require("./eventController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Events
const apiRateLimiter = createRateLimiter("Events");

// Create a new event
router.post("/", roleMiddleware(["organizer", "admin", "manager"]), createEvent);

// Get all events with pagination
router.get("/", apiRateLimiter, getEvents);

//getMinimalEventsInfo
router.get("/organization/:organization", apiRateLimiter, getMinimalEventsInfo);

//get event details
router.get("/:id", getEventDetails);

// Update an existing event
router.put("/:id", updateEvent);

// Delete a event
router.delete("/:id", deleteEvent);

// Clone an existing event
router.post("/:id/clone", roleMiddleware(["organizer", "admin", "manager"]), cloneEvent);

router.get("/:id/ticketings", roleMiddleware(["organizer", "admin", "manager"]),apiRateLimiter, getEventTicketings);


module.exports = router;
