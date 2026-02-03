const express = require("express");
const {
  createOrganization,
  getOrganizationsAdmin,
  updateOrganization,
  deleteOrganization,
  getOrganizationDetails,
  getOrganizationNotifications,
  getOrganizationNamesByCompanyOrganizer,
} = require("./organizationController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Organizations
const apiRateLimiter = createRateLimiter("Organizations");

// Create a new organization
router.post("/", roleMiddleware(["organizer", "admin", "manager"]), createOrganization);

// Get all organizations with pagination
router.get("/", apiRateLimiter, getOrganizationsAdmin);

//get details
router.get("/:id", getOrganizationDetails);
router.get("/:id/notifications", getOrganizationNotifications);

// Update an existing organization
router.put("/:id", roleMiddleware(["organizer", "admin", "manager", "staff"]), updateOrganization);

// Delete a organization
router.delete("/:id", deleteOrganization);

//getOrganizationNamesByCompanyOrganizer
router.get("/names/by-company-organizer/:companyOrganizer", apiRateLimiter, getOrganizationNamesByCompanyOrganizer);

module.exports = router;
