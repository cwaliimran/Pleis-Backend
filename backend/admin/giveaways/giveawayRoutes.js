const express = require("express");
const {
  createGiveaway,
  getGiveaway,
  updateGiveaway,
  deleteGiveaway,
  getevents,
  gettickets,
  getWinners,
} = require("./GiveawayController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const GiveawayRateLimiter = createRateLimiter("Giveaway");


// Get all Promo Codes with pagination
router.get("/events", roleMiddleware(["admin"]), GiveawayRateLimiter, getevents);
router.get("/tickets", roleMiddleware(["admin"]), GiveawayRateLimiter, gettickets);
router.post("/", roleMiddleware(["admin"]), GiveawayRateLimiter, createGiveaway);
router.get("/", roleMiddleware(["admin"]), GiveawayRateLimiter, getGiveaway);
router.get("/winners", roleMiddleware(["admin"]), GiveawayRateLimiter, getWinners);
router.delete("/:id", roleMiddleware(["admin"]), deleteGiveaway);
router.put("/:id", roleMiddleware(["admin"]), updateGiveaway);




module.exports = router;
