const express = require("express");
const {
  createTicketingBooking,
  getTicketingBookings,
  getTicketingBookingById,
  updateTicketingBooking,
  transferTicketingBooking,
  deleteTicketingBooking,
} = require("./ticketingBookingController");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

router.post("/transfer", transferTicketingBooking); //transfer booking ownership to another user
router.post("/", createTicketingBooking);
router.get("/", getTicketingBookings);
router.get("/:id", getTicketingBookingById);
// router.put("/:id", updateTicketingBooking);
// router.delete("/:id", deleteTicketingBooking);

module.exports = router;