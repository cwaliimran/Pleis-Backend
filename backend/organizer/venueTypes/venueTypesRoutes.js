const express = require("express");
const {
  createVenueType,
  getVenueTypes,
  getPublicVenueTypes,
  updateVenueType,
  deleteVenueType,
} = require("./venueTypesController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for VenueTypes
const apiRateLimiter = createRateLimiter("VenueTypes");
//public routes
router.get("/global", apiRateLimiter, getPublicVenueTypes);

// Create a new venuetype
router.post("/", roleMiddleware(["admin"]), createVenueType);

// Get all venuetypes with pagination
router.get("/", getVenueTypes);

// Update an existing venuetype
router.put("/:id", roleMiddleware(["admin"]), updateVenueType);

// Delete a venuetype
router.delete("/:id", roleMiddleware(["admin"]), deleteVenueType);

module.exports = router;
