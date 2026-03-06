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

const router = express.Router();

router.use(auth);

router.post("/transfer", transferTicketingBooking); //transfer booking ownership to another user
router.post("/", createTicketingBooking);
router.get("/", getTicketingBookings);
router.get("/:id", getTicketingBookingById);
router.put("/:id/protection-details", updateTicketingBookingProtectionDetails); //update protection details of a booking
// router.delete("/:id", deleteTicketingBooking);

module.exports = router;