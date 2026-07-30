const express = require("express");
const {
  createOrganization,
  createOrganizationV2,
  getOrganizations,
  updateOrganization,
  updateOrganizationV2,
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
router.post("/v2", roleMiddleware(["organizer", "admin", "manager"]), createOrganizationV2);

// Get all organizations with pagination
router.get("/as-staff", apiRateLimiter, getOrganizationsAsStaff);

// Get all organizations with pagination
router.get("/", apiRateLimiter, getOrganizations);
// Get all organizations with pagination
router.get("/all", apiRateLimiter, getAllOrganizations);

// Delivery options (reuse admin module — scoped by organization id)
router.use(
  "/:organizationId/delivery-options",
  require("../../admin/organizations/deliveryOptions/deliveryOptionsRoutes"),
);

//get details
router.get("/:id", getOrganizationDetails);

// Update an existing organization
router.put("/:id", roleMiddleware(["organizer", "admin", "manager", "staff"]), updateOrganization);
router.put("/v2/:id", roleMiddleware(["organizer", "admin", "manager", "staff"]), updateOrganizationV2);

// Delete a organization
router.delete("/:id", deleteOrganization);

router.get("/:id/notifications", getOrganizationNotifications);


module.exports = router;
