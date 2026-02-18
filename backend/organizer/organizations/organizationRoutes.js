const express = require("express");
const {
  createOrganization,
  getOrganizations,
  updateOrganization,
  deleteOrganization,
  getOrganizationsAsStaff,
  getAllOrganizations
} = require("./organizationController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const { getOrganizationNotifications, getOrganizationDetails } = require("../../admin/organizations/organizationController");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Organizations
const apiRateLimiter = createRateLimiter("Organizations");

// Create a new organization
router.post("/", roleMiddleware(["organizer", "admin", "manager"]), createOrganization);

// Get all organizations with pagination
router.get("/as-staff", apiRateLimiter, getOrganizationsAsStaff);

// Get all organizations with pagination
router.get("/", apiRateLimiter, getOrganizations);
// Get all organizations with pagination
router.get("/all", apiRateLimiter, getAllOrganizations);

//get details
router.get("/:id", getOrganizationDetails);

// Update an existing organization
router.put("/:id", roleMiddleware(["organizer", "admin", "manager", "staff"]), updateOrganization);

// Delete a organization
router.delete("/:id", deleteOrganization);

router.get("/:id/notifications", getOrganizationNotifications);


module.exports = router;
