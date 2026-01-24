const express = require("express");
const {
  getOrganizationsAsStaff,
  checkInToOrganization,
  checkOutFromOrganization
} = require("./organizationController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

router.get("/", getOrganizationsAsStaff);

router.post("/:id/checkin", checkInToOrganization);
router.post("/:id/checkout", checkOutFromOrganization);



module.exports = router;
