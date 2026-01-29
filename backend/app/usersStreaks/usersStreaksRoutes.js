const express = require("express");
const {
  createUsersStreak,
  getUsersStreaks,
  updateUsersStreak,
  getUserMaxStreak
} = require("./usersStreaksController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for UsersStreaks
const apiRateLimiter = createRateLimiter("UsersStreaks");
// Create a new usersStreak
router.post("/", apiRateLimiter, roleMiddleware(["user"]), createUsersStreak);

// Get all usersStreaks with pagination
router.get("/", getUserMaxStreak);

// // Update an existing usersStreak
// router.put("/:id", roleMiddleware(["user"]), updateUsersStreak);

// Delete a usersStreak
// router.delete("/:id", roleMiddleware(["user"]), deleteUsersStreak);

module.exports = router;
