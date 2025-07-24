const express = require("express");
const {
  createOrganization,
  getOrganizations,
  updateOrganization,
  deleteOrganization,
  getPublicOrganizations,
} = require("./organizationsController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const admin = require("../../middlewares/adminMiddleware");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

//public routes
router.get("/public", getPublicOrganizations);

router.use(auth);

// Create a rate limiter for Organizations
const apiRateLimiter = createRateLimiter("Organizations");

// Create a new organization
router.post("/", admin, createOrganization);

// Get all organizations with pagination
router.get("/", apiRateLimiter, getOrganizations);

// Update an existing organization
router.put("/:id", admin, updateOrganization);

// Delete a organization
router.delete("/:id", admin, deleteOrganization);

module.exports = router;
