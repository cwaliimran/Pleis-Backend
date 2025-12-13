const express = require("express");
const router = express.Router();


router.use("/rewards", require("./rewards/rewardsRoutes"));


module.exports = router;