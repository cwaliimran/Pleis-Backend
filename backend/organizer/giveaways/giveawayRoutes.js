const express = require("express");
const {
  createGiveaway,
  getGiveaway,
  updateGiveaway,
  deleteGiveaway,
  getevents,
  gettickets,
} = require("./GiveawayController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const GiveawayRateLimiter = createRateLimiter("Giveaway");


// Get all Promo Codes with pagination
router.get("/events", roleMiddleware(["organizer"]), GiveawayRateLimiter, getevents);
router.get("/tickets", roleMiddleware(["organizer"]), GiveawayRateLimiter, gettickets);
router.post("/", roleMiddleware(["organizer"]), GiveawayRateLimiter, createGiveaway);
router.get("/", roleMiddleware(["organizer"]), GiveawayRateLimiter, getGiveaway);
router.delete("/:id", roleMiddleware(["organizer"]), deleteGiveaway);
router.put("/:id", roleMiddleware(["organizer"]), updateGiveaway);




module.exports = router;
