const express = require("express");
const {
  createTopPicksOrganization,
  getTopPicksOrganizations,
  updateTopPicksOrganization,
  deleteTopPicksOrganization,
  reorderTopPicksOrganization,
} = require("./topPicksOrganizationsController");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);
router.use(roleMiddleware(["admin"]));

// Create a new topPicksOrganization
router.post("/", createTopPicksOrganization);

// Get all topPicksOrganizations with pagination
router.get("/", getTopPicksOrganizations);

// Update an existing topPicksOrganization
router.put("/:id", updateTopPicksOrganization);

// Delete a topPicksOrganization
router.delete("/:id", deleteTopPicksOrganization);

// Reorder topPicksOrganizations
router.post("/reorder", reorderTopPicksOrganization);

module.exports = router;
