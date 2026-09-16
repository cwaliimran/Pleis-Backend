const express = require("express");
const router = express.Router();

router.use("/venues", require("../../admin/venues/venuesRoutes"));

module.exports = router;
