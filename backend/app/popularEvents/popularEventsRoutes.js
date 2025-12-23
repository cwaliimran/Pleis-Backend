const express = require("express");
const {
  popularEvents,
} = require("./popularEventsController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Popular Events
const popularEventsRateLimiter = createRateLimiter("PopularEvents");

// Routes for Promo Code Management
// use  Promo Code
// router.post("/", popularEventsRateLimiter, popularEvents);
router.post("/", popularEventsRateLimiter, popularEvents);

module.exports = router;
