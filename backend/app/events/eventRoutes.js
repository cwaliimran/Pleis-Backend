const express = require("express");
const {
  getEventDetails,
  getNearbyEvents,
} = require("./eventController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Events
const apiRateLimiter = createRateLimiter("AppEvents");

// Get nearby events
router.get("/nearby", apiRateLimiter, getNearbyEvents);

//get event details
router.get("/:id", apiRateLimiter, getEventDetails);




module.exports = router;
