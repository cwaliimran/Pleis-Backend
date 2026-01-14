const express = require("express");
const {
  createReservation,
  getReservations,
  updateReservation,
  deleteReservation,
  getReservationDetails,
  getUserReservations,
  updateUserReservationStatus,
  updateUserReservation,
  getavailableReservations,
  getCalendarReservations
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
router.post("/", auth,roleMiddleware(["admin"]), createReservation);

// Get all Reservations with pagination
router.get("/", roleMiddleware(["admin"]),apiRateLimiter, getReservations);
router.get("/calendar", roleMiddleware(["admin"]),apiRateLimiter, getCalendarReservations);
// Get all Reservations with pagination
router.get("/available", roleMiddleware(["admin"]),apiRateLimiter, getavailableReservations);

// Get all Users Reservations with pagination
router.get("/users",roleMiddleware(["admin"]), apiRateLimiter, getUserReservations);


// //get Reservation details
// router.get("/:id", apiRateLimiterDetails, getReservationDetails);

// Update an existing Reservation
router.put("/:id", roleMiddleware(["admin"]), updateReservation);
// cancel user reservation
router.put("/updateStatus/:id/:value", roleMiddleware(["admin"]), updateUserReservationStatus);

// update user reservation
router.put("/:userId/:id", roleMiddleware(["admin"]), updateUserReservation);


// Delete a Reservation
router.delete("/:id", roleMiddleware(["admin"]), deleteReservation);

module.exports = router;
