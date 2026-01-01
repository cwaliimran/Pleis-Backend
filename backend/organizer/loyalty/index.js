const express = require("express");
const router = express.Router();


router.use("/rewards", require("./rewards/rewardsRoutes"));
router.use("/referral", require("./referral/loyaltyReferralRoutes"));


module.exports = router;