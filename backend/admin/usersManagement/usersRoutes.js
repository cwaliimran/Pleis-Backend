const express = require("express");
const {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  getUserDetails,
  setupTwoFAController,
  confirmTwoFAController,
  disableTwoFAController,
  createUserInterests,
  getUserInterestsByUserId,
  getUserByFilters,
} = require("./usersController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Users
const apiRateLimiterUsers = createRateLimiter("/users");
const apiRateLimiterUserDetail = createRateLimiter("/users/details");
const apiRateLimiterUserCreation = createRateLimiter("/users/create");
const apiRateLimiterUserUpdate = createRateLimiter("/users/update");
const apiRateLimiterUserDeletion = createRateLimiter("/users/delete");
const apiRateLimiterUserTwoFA = createRateLimiter("/users/twofa/setup", 3, 10); // 3 requests per 10 minutes
const apiRateLimiterTwoFAConfirm = createRateLimiter("/users/twofa/confirm", 5, 10); // 5 requests per 10 minutes
const apiRateLimiterTwoFADisable = createRateLimiter("/users/twofa/disable", 2, 30); // 2 requests per 30 minutes
const apiRateLimiterInterests = createRateLimiter("/users/interests", 10, 10); // 10 requests per 10 minutes
const apiRateLimiterUserInterests = createRateLimiter("/users/interests/:id", 5, 10); // 5 requests per 10 minutes

// Create a new user
router.post("/", roleMiddleware(["admin", "organizer", "manager"]), apiRateLimiterUserCreation, createUser);

//create user interests
router.post("/interests", apiRateLimiterInterests, createUserInterests);
//get user interests by userId
router.get("/interests", apiRateLimiterUserInterests, getUserInterestsByUserId);

// Get user profile
router.get("/details", apiRateLimiterUserDetail, getUserByFilters);
router.get("/:id", apiRateLimiterUserDetail, getUserDetails);

// Get all users with pagination
router.get("/", apiRateLimiterUsers, roleMiddleware(["admin", "organizer", "manager"]), getUsers);

// Update an existing user
router.put("/:id", apiRateLimiterUserUpdate, updateUser);

// Start 2FA setup (get QR code)
router.post("/twofa/setup", apiRateLimiterUserTwoFA, setupTwoFAController);

// Confirm 2FA (verify token)
router.post("/twofa/confirm", apiRateLimiterTwoFAConfirm, confirmTwoFAController);

// Disable 2FA
router.post("/twofa/disable", apiRateLimiterTwoFADisable, disableTwoFAController);

// Delete a user
router.delete("/:id", apiRateLimiterUserDeletion, deleteUser);

module.exports = router;
