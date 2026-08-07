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
  changeUsersReservationsTiming,
  createReservationPreferences,
  getReservationsV2,
  getReservationsV2Calender,
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
router.post("/", auth,roleMiddleware(["admin", "staff", "organizer", "manager"]), createReservation);
router.use("/user", require("../../app/reservations/reservationRoutes"));
router.post(
  "/preferences",
  auth,
  roleMiddleware(["admin", "staff", "organizer", "manager"]),
  createReservationPreferences,
);

// Get all Reservations with pagination
router.get("/", roleMiddleware(["admin", "staff", "organizer", "manager"]),apiRateLimiter, getReservations);
router.get(
  "/v2",
  roleMiddleware(["admin", "staff", "organizer", "manager"]),
  apiRateLimiter,
  getReservationsV2,
);
router.get(
  "/v2/calender",
  roleMiddleware(["admin", "staff", "organizer", "manager"]),
  apiRateLimiter,
  getReservationsV2Calender,
);
router.get("/calendar", roleMiddleware(["admin", "staff", "organizer", "manager"]),apiRateLimiter, getCalendarReservations);
router.post("/copy", roleMiddleware(["admin", "staff", "organizer", "manager"]),apiRateLimiter, copyUserReservationsController);
router.post("/copy-slots", roleMiddleware(["admin", "staff", "organizer", "manager"]),apiRateLimiter, copyReservationSlotsController);
// Get all Reservations with pagination
router.get("/available", roleMiddleware(["admin", "staff", "organizer", "manager"]),apiRateLimiter, getavailableReservations);

// Get all Users Reservations with pagination
router.get("/users",roleMiddleware(["admin", "staff", "organizer", "manager"]), apiRateLimiter, getUserReservations);


// //get Reservation details
// router.get("/:id", apiRateLimiterDetails, getReservationDetails);

// change reservation timing by clicking on clock icon in admin panel reservation calendar
router.put("/change-timing", roleMiddleware(["admin", "staff", "organizer", "manager"]), changeUsersReservationsTiming);

// Update an existing Reservation
router.put("/:id", roleMiddleware(["admin", "staff", "organizer", "manager"]), updateReservation);
// cancel user reservation
router.put("/updateStatus/:id/:value", roleMiddleware(["admin", "staff", "organizer", "manager"]), updateUserReservationStatus);

// update user reservation
router.put("/:userId/:id", roleMiddleware(["admin", "staff", "organizer", "manager"]), updateUserReservation);

// Delete a Reservation
router.delete("/:id", roleMiddleware(["admin", "staff", "organizer", "manager"]), deleteReservation);

module.exports = router;
