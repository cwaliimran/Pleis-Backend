const express = require("express");
const { createOccasion, getOccasion, updateOccasion, deleteOccasion } = require("./occasionController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Reservation Types
const OccasionRateLimiter = createRateLimiter("Occasion");

// Routes for Reservation Type Management
// Create a new Reservation Type
router.post("/", roleMiddleware(["admin","organizer"]), OccasionRateLimiter, createOccasion);

// Get all Reservation Types with pagination
router.get("/", roleMiddleware(["admin", "staff","organizer"]), OccasionRateLimiter, getOccasion);

// Update an existing Reservation Type
router.put("/:id", roleMiddleware(["admin","organizer"]), OccasionRateLimiter, updateOccasion);

// Delete a Reservation Type
router.delete("/:id", roleMiddleware(["admin","organizer"]), OccasionRateLimiter, deleteOccasion);

module.exports = router;
