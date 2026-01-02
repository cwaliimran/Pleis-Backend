const express = require("express");
const {
  getEvents,
  getEventDetails,
} = require("./eventController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Events
const apiRateLimiter = createRateLimiter("Events");

// Get all events with pagination
router.get("/", apiRateLimiter, getEvents);

//get event details
router.get("/:id", getEventDetails);


module.exports = router;
