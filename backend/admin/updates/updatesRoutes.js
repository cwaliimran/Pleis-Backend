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
router.get("/events", roleMiddleware(["admin"]), UpdatesRateLimiter, getevents);
router.post("/", roleMiddleware(["admin"]), UpdatesRateLimiter, createUpdates);
router.get("/", roleMiddleware(["admin"]), UpdatesRateLimiter, getUpdatess);
router.delete("/:id", roleMiddleware(["admin"]), deleteUpdates);
router.put("/:id", roleMiddleware(["admin"]), updateUpdates);




module.exports = router;
