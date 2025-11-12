const express = require("express");
const {
  createStatusBadge,
  getStatusBadges,
  updateStatusBadge,
  deleteStatusBadge,
  reorderStatusBadge,
} = require("./statusBadgesController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for StatusBadges
const apiRateLimiter = createRateLimiter("StatusBadges");

// Create a new statusBadge
router.post("/", roleMiddleware(["admin"]), createStatusBadge);

// Get all statusBadges with pagination
router.get("/",apiRateLimiter, getStatusBadges);

// Update an existing statusBadge
router.put("/:id", roleMiddleware(["admin"]), updateStatusBadge);

// Delete a statusBadge
router.delete("/:id", roleMiddleware(["admin"]), deleteStatusBadge);

// Reorder statusBadges
router.post("/reorder", roleMiddleware(["admin"]), reorderStatusBadge);

module.exports = router;
