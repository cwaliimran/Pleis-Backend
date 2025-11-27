// loyaltyRoutes.js
const express = require("express");
const router = express.Router();

router.use("/status-levels", require("./statusLevels/statusLevelsRoutes"));


module.exports = router;
