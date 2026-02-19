const express = require("express");
const {
  createUserBillingInformation,
  getUserBillingInformations,
  updateUserBillingInformation,
  deleteUserBillingInformation,
} = require("./userBillingInformationController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const UserBillingInformationRateLimiter = createRateLimiter("UserBillingInformations");

// Routes for Promo Code Management
// Create a new Promo Code
router.post("/", UserBillingInformationRateLimiter, createUserBillingInformation);

// Get all Promo Codes with pagination
router.get("/",  UserBillingInformationRateLimiter, getUserBillingInformations);


// Update an existing Promo Code
router.put("/:id",  updateUserBillingInformation);

// Delete a Promo Code
router.delete("/:id",  deleteUserBillingInformation);

module.exports = router;
