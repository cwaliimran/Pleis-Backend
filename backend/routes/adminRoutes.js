// loyaltyRoutes.js
const express = require("express");
const router = express.Router();

//organizations
router.use("/organizations", require("../commonModules/organizations/organizationRoutesAdmin"));

module.exports = router;
