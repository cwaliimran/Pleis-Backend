const express = require("express");
const {
  getUsersStreaks,
  updateUsersStreak,
} = require("./usersStreaksController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for UsersStreaks
const apiRateLimiter = createRateLimiter("UsersStreaks");

// Get all usersStreaks with pagination
router.get("/", apiRateLimiter, getUsersStreaks);

// Update an existing usersStreak
router.put("/:id", roleMiddleware(["admin"]), updateUsersStreak);

// Delete a usersStreak
// router.delete("/:id", roleMiddleware(["admin"]), deleteUsersStreak);

module.exports = router;
