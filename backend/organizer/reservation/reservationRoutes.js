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
  getCalendarReservations,
  copyUserReservationsController,
  copyReservationSlotsController,
  changeUsersReservationsTiming
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
router.post("/", auth,roleMiddleware(["organizer"]), createReservation);

// Get all Reservations with pagination
router.get("/", roleMiddleware(["organizer"]),apiRateLimiter, getReservations);
router.get("/calendar", roleMiddleware(["organizer"]),apiRateLimiter, getCalendarReservations);
router.post("/copy", roleMiddleware(["organizer"]),apiRateLimiter, copyUserReservationsController);
router.post("/copy-slots", roleMiddleware(["organizer"]),apiRateLimiter, copyReservationSlotsController);
// Get all Reservations with pagination
router.get("/available", roleMiddleware(["organizer"]),apiRateLimiter, getavailableReservations);

// Get all Users Reservations with pagination
router.get("/users",roleMiddleware(["organizer"]), apiRateLimiter, getUserReservations);


// //get Reservation details
// router.get("/:id", apiRateLimiterDetails, getReservationDetails);

// change reservation timing by clicking on clock icon in admin panel reservation calendar
router.put("/change-timing", roleMiddleware(["organizer"]), changeUsersReservationsTiming);

// Update an existing Reservation
router.put("/:id", roleMiddleware(["organizer"]), updateReservation);
// cancel user reservation
router.put("/updateStatus/:id/:value", roleMiddleware(["organizer"]), updateUserReservationStatus);

// update user reservation
router.put("/:userId/:id", roleMiddleware(["organizer"]), updateUserReservation);

// Delete a Reservation
router.delete("/:id", roleMiddleware(["organizer"]), deleteReservation);

module.exports = router;
