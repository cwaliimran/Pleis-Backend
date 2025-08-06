const express = require("express");
const router = express.Router();

router.use("/venues", require("../venues/venuesRoutes"));

module.exports = router;
