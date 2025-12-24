const express = require("express");
const {
  getTopPicksOrganizations,
} = require("./topPicksOrganizationsController");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

// Get all topPicksOrganizations with pagination
router.post("/", getTopPicksOrganizations);

module.exports = router;
