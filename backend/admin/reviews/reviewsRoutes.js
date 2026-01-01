const express = require("express");
const {
  getReviews,
  updateReviews,
  deleteReview
} = require("./reviewsController"); // Assuming you have a separate controller for promo codes
const getRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



// Routes for Promo Code Management
// use  Promo Code
router.get("/", auth, getReviews);
router.put("/:id", auth, updateReviews);
router.delete("/:id", roleMiddleware(["admin"]), deleteReview);

module.exports = router;
