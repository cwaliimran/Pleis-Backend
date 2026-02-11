const express = require("express");
const {
  createReservation,
  getReservations,
  updateReservation,
  deleteReservation,
  getUserReservationDetails,
  getUserReservations,
  transferReservation
} = require("./reservationController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Reservations
const apiRateLimiter = createRateLimiter("Reservations");
const apiRateLimiterDetails = createRateLimiter("Reservations/:id");

// Create a new Reservation
router.post("/transfer", auth, transferReservation);
router.post("/", auth, createReservation);

// Get all Reservations with pagination
router.get("/", auth, getReservations);

//get Reservation details
router.get("/details/:id", apiRateLimiterDetails, getUserReservationDetails);

// Update an existing Reservation
router.put("/:id",auth, updateReservation);

// Delete a Reservation
router.delete("/:id",  auth,deleteReservation);

// get all user reservations
router.get("/all",auth,  getUserReservations);

module.exports = router;
