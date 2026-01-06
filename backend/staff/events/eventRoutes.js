const express = require("express");
const {
  getEvents,
  getEventDetails,
  getEventAttendees,
  checkInEventAttendee
} = require("./eventController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Events
const apiRateLimiter = createRateLimiter("Events");

// Get all events with pagination
router.get("/", apiRateLimiter, getEvents);

//get event attendees
router.get("/:id/attendees", getEventAttendees);

//event attendees checkin
router.post("/:id/checkin/:ticketBookingId", checkInEventAttendee);

//get event details
router.post("/:id", getEventDetails);


module.exports = router;
