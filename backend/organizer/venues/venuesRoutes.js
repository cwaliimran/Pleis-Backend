const express = require("express");
const {
  createVenue,
  getVenues,
  updateVenue,
  deleteVenue,
  getVenueDetails,
  getUnassignedVenues
} = require("./venuesController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Venues
const apiRateLimiter = createRateLimiter("Venues");
const apiRateLimiterDetails = createRateLimiter("Venues/:id");

// Create a new venue
router.post("/", roleMiddleware([ "organizer"]), createVenue);

// Get all venues with pagination
router.get("/", apiRateLimiter, getVenues);

// Get unassigned venues
router.get("/unassigned", roleMiddleware(["admin", "organizer", "staff", "manager"]), getUnassignedVenues);

//get venue details
router.get("/:id", apiRateLimiterDetails, getVenueDetails);

// Update an existing venue
router.put("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), updateVenue);

// Delete a venue
router.delete("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), deleteVenue);

module.exports = router;
