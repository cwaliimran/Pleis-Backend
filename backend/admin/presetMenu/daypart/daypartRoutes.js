const express = require("express");
const {
  createDaypart,
  getDayparts,
  getDaypartCode,
  updateDaypart,
  deleteDaypart,
} = require("./daypartController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Diet Tags
const DaypartRateLimiter = createRateLimiter("Daypart");

// Routes for Diet Tags Management
// Create a new Diet Tag
router.post("/", roleMiddleware(["admin"]), DaypartRateLimiter, createDaypart);

// Get all Promo Codes with pagination
router.get("/", roleMiddleware(["admin"]), DaypartRateLimiter, getDayparts);
router.get("/code", roleMiddleware(["admin"]), DaypartRateLimiter, getDaypartCode);


// Update an existing Promo Code
router.put("/:id", roleMiddleware(["admin"]), updateDaypart);

// Delete a Promo Code
router.delete("/:id", roleMiddleware(["admin"]), deleteDaypart);

module.exports = router;
