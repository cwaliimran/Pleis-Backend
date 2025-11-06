const express = require("express");
const {
  createTicketing,
  getTicketings,
  updateTicketing,
  deleteTicketing,
  getTicketingDetails,
} = require("./ticketingsController");

const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

// ✅ Apply authentication middleware globally
router.use(auth);

/**
 * @route POST /ticketings
 * @desc Create a new ticketing (Admin, Organizer, Manager only)
 */
router.post("/", roleMiddleware(["admin", "organizer", "manager"]), createTicketing);


//getTicketingDetails
router.get("/:id", getTicketingDetails);

/**
 * @route GET /ticketings
 * @desc Get all ticketings (with filters: keyword, status, date, eventId)
 * @access Authenticated
 */
router.get("/", getTicketings);

/**
 * @route PUT /ticketings/:id
 * @desc Update a ticketing (Admin only)
 */
router.put("/:id", roleMiddleware(["admin"]), updateTicketing);

/**
 * @route DELETE /ticketings/:id
 * @desc Soft delete a ticketing (Admin only)
 */
router.delete("/:id", roleMiddleware(["admin"]), deleteTicketing);

module.exports = router;
