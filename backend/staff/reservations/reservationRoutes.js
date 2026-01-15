const express = require("express");
const {
  createReservation,
  getUserBookingsByDate,
  updateReservationStatus,
} = require("./reservationController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.post("/", auth, createReservation);

// Get all Reservations with pagination
router.get("/", auth, getUserBookingsByDate);

// Cancel a Reservation
router.put("/:id", auth, updateReservationStatus);


module.exports = router;
