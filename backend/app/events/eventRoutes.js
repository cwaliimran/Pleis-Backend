const express = require("express");
const {
  getEventDetails,
  getEventTicketings,
  getNearbyEventsWithAdvanceFilters
} = require("./eventController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Events
const apiRateLimiter = createRateLimiter("AppEvents");

// Get nearby events
router.post("/filter", apiRateLimiter, getNearbyEventsWithAdvanceFilters); // also gets nearby events with advanced filters by default

//get event details
router.get("/:id", apiRateLimiter, getEventDetails);

//ticketing
router.get("/:id/ticketings", apiRateLimiter, getEventTicketings);




module.exports = router;
