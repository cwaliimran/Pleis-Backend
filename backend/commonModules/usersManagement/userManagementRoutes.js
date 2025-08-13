const express = require("express");
const {
  createUserManagement,
  getUserManagements,
  updateUserManagement,
  deleteUserManagement,
  getUserManagementDetails,
} = require("./usermanagementController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for UserManagements
const apiRateLimiter = createRateLimiter("UserManagements");

// Create a new usermanagement
router.post("/", roleMiddleware(["admin", "organizer"]), createUserManagement);

// Get all usermanagements with pagination
router.get("/", apiRateLimiter, getUserManagements);

//get usermanagement details
router.get("/:id", getUserManagementDetails);

// Update an existing usermanagement
router.put("/:id", roleMiddleware(["admin"]), updateUserManagement);

// Delete a usermanagement
router.delete("/:id", roleMiddleware(["admin"]), deleteUserManagement);

module.exports = router;
