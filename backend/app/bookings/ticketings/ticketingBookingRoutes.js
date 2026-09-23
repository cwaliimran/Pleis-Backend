const express = require("express");
const {
  createTicketingBooking,
  getTicketingBookings,
  getTicketingBookingById,
  updateTicketingBooking,
  transferTicketingBooking,
  deleteTicketingBooking,
  updateTicketingBookingProtectionDetails,
} = require("./ticketingBookingController");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

const requireAppUser = roleMiddleware(["user"]);

router.post("/transfer", requireAppUser, transferTicketingBooking); //transfer booking ownership to another user
router.post("/", requireAppUser, createTicketingBooking);
router.get("/", getTicketingBookings);
router.get("/:id", getTicketingBookingById);
router.put("/:id/protection-details", updateTicketingBookingProtectionDetails); //update protection details of a booking
// router.delete("/:id", deleteTicketingBooking);

module.exports = router;