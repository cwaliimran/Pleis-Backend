const express = require("express");
const { getReservationPreferencess, updateReservationPreferences } = require("./reservationPreferencesController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

const ReservationPreferencesRateLimiter = createRateLimiter("ReservationPreferencess");
router.get("/", roleMiddleware(["admin", "staff"]), ReservationPreferencesRateLimiter, getReservationPreferencess);
router.put("/:id", roleMiddleware(["admin"]), updateReservationPreferences);

module.exports = router;
