const express = require("express");
const {
  createVenueType,
  getVenueTypes,
  getPublicVenueTypes,
  updateVenueType,
  deleteVenueType,
} = require("./venuetypesController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const admin = require("../../middlewares/adminMiddleware");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

//public routes
router.get("/public", getPublicVenueTypes);

router.use(auth);

// Create a rate limiter for VenueTypes
const apiRateLimiter = createRateLimiter("VenueTypes");

// Create a new venuetype
router.post("/", admin, createVenueType);

// Get all venuetypes with pagination
router.get("/", apiRateLimiter, getVenueTypes);

// Update an existing venuetype
router.put("/:id", admin, updateVenueType);

// Delete a venuetype
router.delete("/:id", admin, deleteVenueType);

module.exports = router;
