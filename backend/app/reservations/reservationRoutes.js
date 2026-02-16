const express = require("express");
const {
  createReservation,
  getReservations,
  getUserReservationDetails,
  getUserReservations,
  transferReservation,
  acceptReservationChange,
  cancelReservation,
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

// get all user reservations
router.get("/all",auth,  getUserReservations);

//reservation changes and refunds processing
router.post("/:id/accept-change", auth, acceptReservationChange);
router.post("/:id/cancel", auth, cancelReservation);
// router.post("/:id/process-refund", auth, roleMiddleware("admin"), processRefund);


module.exports = router;
