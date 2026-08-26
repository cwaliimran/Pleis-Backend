const express = require("express");
const {
  createReservationType,
  getReservationTypes,
  updateReservationType,
  deleteReservationType,
} = require("./reservationTypeController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Reservation Types
const ReservationTypeRateLimiter = createRateLimiter("ReservationTypes");

// Routes for Reservation Type Management
// Create a new Reservation Type
router.post("/", roleMiddleware(["admin","organizer"]), ReservationTypeRateLimiter, createReservationType);

// Get all Reservation Types with pagination
router.get("/", roleMiddleware(["admin", "staff","organizer"]), ReservationTypeRateLimiter, getReservationTypes);

// Update an existing Reservation Type
router.put("/:id", roleMiddleware(["admin","organizer"]), ReservationTypeRateLimiter, updateReservationType);

// Delete a Reservation Type
router.delete("/:id", roleMiddleware(["admin","organizer"]), ReservationTypeRateLimiter, deleteReservationType);

module.exports = router;
