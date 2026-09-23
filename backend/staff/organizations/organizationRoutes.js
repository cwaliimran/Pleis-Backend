const express = require("express");
const {
  getOrganizationsAsStaff,
  checkInToOrganization,
  checkOutFromOrganization,
} = require("./organizationController");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

router.get("/", getOrganizationsAsStaff);

router.post("/:id/checkin", checkInToOrganization);
router.post("/:id/checkout", checkOutFromOrganization);

// Same delivery-options list used by admin/organizer order-management filters.
router.use(
  "/:organizationId/delivery-options",
  require("../../admin/organizations/deliveryOptions/deliveryOptionsRoutes"),
);

module.exports = router;
