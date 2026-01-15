const express = require("express");
const {
  createGiveaway,
  getGiveaway,
  updateGiveaway,
  deleteGiveaway,
  getevents,
  gettickets,
} = require("./giveawayController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const GiveawayRateLimiter = createRateLimiter("Giveaway");


router.post("/", roleMiddleware(["user"]), GiveawayRateLimiter, createGiveaway);
router.get("/", roleMiddleware(["user"]), GiveawayRateLimiter, getGiveaway);




module.exports = router;
