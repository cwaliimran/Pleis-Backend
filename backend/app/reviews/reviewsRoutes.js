const express = require("express");
const {
  createReviews,
  getReviews
} = require("./reviewsController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Routes for Promo Code Management
// use  Promo Code
router.post("/", auth, createReviews);
router.get("/", auth, getReviews);


module.exports = router;
