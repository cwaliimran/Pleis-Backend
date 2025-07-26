const express = require("express");
const {
  createVenue,
  getVenues,
  updateVenue,
  deleteVenue,
} = require("./venuesController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const admin = require("../../middlewares/adminMiddleware");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Venues
const apiRateLimiter = createRateLimiter("Venues");

// Create a new venue
router.post("/", admin, createVenue);

// Get all venues with pagination
router.get("/", apiRateLimiter, getVenues);

// Update an existing venue
router.put("/:id", admin, updateVenue);

// Delete a venue
router.delete("/:id", admin, deleteVenue);

module.exports = router;
