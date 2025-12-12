const express = require("express");
const {
  createUpdates,
  getUpdatess,
  updateUpdates,
  deleteUpdates,
  getevents,
} = require("./updatesController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Create a rate limiter for Promo Codes
const UpdatesRateLimiter = createRateLimiter("Updatess");


// Get all Promo Codes with pagination
router.get("/events", roleMiddleware(["organizer"]), UpdatesRateLimiter, getevents);
router.post("/", roleMiddleware(["organizer"]), UpdatesRateLimiter, createUpdates);
router.get("/", roleMiddleware(["organizer"]), UpdatesRateLimiter, getUpdatess);
router.delete("/:id", roleMiddleware(["organizer"]), deleteUpdates);
router.put("/:id", roleMiddleware(["organizer"]), updateUpdates);




module.exports = router;
