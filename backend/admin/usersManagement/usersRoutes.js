const express = require("express");
const {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  getUserDetails
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

// Delete a user
router.delete("/:id", roleMiddleware(["admin"]), deleteUser);

module.exports = router;
