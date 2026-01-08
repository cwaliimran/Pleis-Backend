const express = require("express");
const {
  redirectToMonri,
} = require("./monriController");

const router = express.Router();

router.get("/redirect", redirectToMonri);

module.exports = router;
