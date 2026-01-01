const express = require("express");
const {
  applyPoints,
  calculatePoints
} = require("./transactionsController");

const router = express.Router();
  
router.post("/apply",  applyPoints);
router.post("/calculate",  calculatePoints);


module.exports = router;
