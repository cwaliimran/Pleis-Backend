const express = require("express");
const {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  getUserDetails,
  toggleTwoFA,
  verifyTwoFA
} = require("./usersController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Users
const apiRateLimiterUsers = createRateLimiter("Users");
const apiRateLimiterUserDetail = createRateLimiter("Users details");


// Create a new user
router.post("/", roleMiddleware(["admin", "organizer", "manager"]), createUser);

// Get user profile
router.get("/:id", apiRateLimiterUserDetail, getUserDetails);

// Get all users with pagination
router.get("/", apiRateLimiterUsers, getUsers);

// Update an existing user
router.put("/:id", updateUser);


// Toggle 2FA (Enable/Disable)
router.post("/twofa", toggleTwoFA);

// Verify 2FA token
router.post("/twofa/verify", verifyTwoFA);


// Delete a user
router.delete("/:id", deleteUser);

module.exports = router;
