const express = require("express");
const {
  createOrganization,
  createOrganizationV2,
  getOrganizationsAdmin,
  updateOrganization,
  updateOrganizationV2,
  deleteOrganization,
  getOrganizationDetails,
  getOrganizationNotifications,
  getOrganizationNamesByCompanyOrganizer,
  getOrganizationsByTag,
  getOrganizationsByVenueType,
  getAllOrganizationsAdmin,
} = require("./organizationController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Organizations
const apiRateLimiter = createRateLimiter("Organizations");
router.get("/all", apiRateLimiter, getAllOrganizationsAdmin);
// Create a new organization
router.post("/", roleMiddleware(["organizer", "admin", "manager"]), createOrganization);
router.post("/v2", roleMiddleware(["organizer", "admin", "manager"]), createOrganizationV2);

// Delivery options (scoped by organization)
router.use(
  "/:organizationId/delivery-options",
  require("./deliveryOptions/deliveryOptionsRoutes"),
);

// Get all organizations with pagination
router.get("/", apiRateLimiter, getOrganizationsAdmin);

//get details
router.get("/:id", getOrganizationDetails);
router.get("/:id/notifications", getOrganizationNotifications);

// Update an existing organization
router.put("/:id", roleMiddleware(["organizer", "admin", "manager", "staff"]), updateOrganization);
router.put("/v2/:id", roleMiddleware(["organizer", "admin", "manager", "staff"]), updateOrganizationV2);

// Delete a organization
router.delete("/:id", deleteOrganization);
 // Get all organizations without pagination

//getOrganizationNamesByCompanyOrganizer
router.get("/names/by-company-organizer/:companyOrganizer", apiRateLimiter, getOrganizationNamesByCompanyOrganizer);

router.get("/tag/:tagId", apiRateLimiter, getOrganizationsByTag);
router.get("/venue-type/:venueTypeId", apiRateLimiter, getOrganizationsByVenueType);

module.exports = router;
