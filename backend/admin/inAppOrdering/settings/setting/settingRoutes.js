const express = require("express");
const {
  createSetttings,
  getSetttings,
  getSetttingsCode,
  updateSetttings,
  deleteSetttings,
} = require("./settingController"); // Assuming you have a separate controller for promo codes


const createRateLimiter = require("@utils/rateLimiter");
const roleMiddleware = require("../../../../middlewares/roleMiddleware");
const auth = require("../../../../middlewares/authMiddleware");

const router = express.Router();


router.use(auth);

// Create a rate limiter for Diet Tags
const SetttingsRateLimiter = createRateLimiter("Setttings");
router.get("/", roleMiddleware(["admin","organizer"]), SetttingsRateLimiter, getSetttings);
router.put("/", roleMiddleware(["admin","organizer"]), SetttingsRateLimiter, updateSetttings);


module.exports = router;
