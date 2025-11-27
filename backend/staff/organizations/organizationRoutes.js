const express = require("express");
const {

  getOrganizationsAsStaff,

} = require("./organizationController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

router.get("/",  getOrganizationsAsStaff);


module.exports = router;
