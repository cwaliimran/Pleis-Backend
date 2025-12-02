const express = require("express");
const {
  createSettings,

} = require("./referralsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);
router.post("/", roleMiddleware(["admin", "organizer", "manager"]), createSettings);


module.exports = router;
