const express = require("express");
const {
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent,
  getEventDetails,
  getEventAnalytics,
  getEventTicketsAnalytics,
  cloneEvent,
  getMinimalEventsInfo,
  getEventTicketings,
  getEventNotifications,
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

//get event analytics
router.get("/:id/analytics", getEventAnalytics);
//get event tickets analytics
router.get("/:id/tickets-analytics", getEventTicketsAnalytics);
//get event notificaitons
router.get("/:id/notifications", getEventNotifications);

// Update an existing event
router.put("/:id", updateEvent);

// Delete a event
router.delete("/:id", deleteEvent);

// Clone an existing event
router.post("/:id/clone", roleMiddleware(["organizer", "admin", "manager"]), cloneEvent);

router.get("/:id/ticketings", roleMiddleware(["organizer", "admin", "manager"]),apiRateLimiter, getEventTicketings);


module.exports = router;
