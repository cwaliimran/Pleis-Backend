const express = require("express");
const {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
} = require("./usersController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Users
const apiRateLimiter = createRateLimiter("Users");


// Create a new user
router.post("/", roleMiddleware(["admin"]), createUser);

// Get all users with pagination
router.get("/", roleMiddleware(["admin"]), getUsers);

// Update an existing user
router.put("/:id", roleMiddleware(["admin"]), updateUser);

// Delete a user
router.delete("/:id", roleMiddleware(["admin"]), deleteUser);

module.exports = router;
