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
router.post("/nearby", apiRateLimiter, getNearbyEventsWithAdvanceFilters);

//get event details
router.get("/:id", apiRateLimiter, getEventDetails);

//ticketing
router.get("/:id/ticketings", apiRateLimiter, getEventTicketings);




module.exports = router;
