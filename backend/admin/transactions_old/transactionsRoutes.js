const express = require("express");
const {
  getTransactions,
} = require("./transactionsController");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

router.get("/", getTransactions);

module.exports = router;