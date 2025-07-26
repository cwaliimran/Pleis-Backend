const express = require("express");
const {
  createOrganization,
  getOrganizations,
  updateOrganization,
  deleteOrganization,
} = require("./organizationController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const admin = require("../../middlewares/adminMiddleware");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Organizations
const apiRateLimiter = createRateLimiter("Organizations");

// Create a new organization
router.post("/", roleMiddleware(["organizer"]), createOrganization);

// Get all organizations with pagination
router.get("/", apiRateLimiter, getOrganizations);

// Update an existing organization
router.put("/:id", updateOrganization);

// Delete a organization
router.delete("/:id" , deleteOrganization);

module.exports = router;
