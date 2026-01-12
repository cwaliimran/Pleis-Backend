const express = require("express");
const {
  redirectToMonri,
  handleSuccess,
  handleCancel,
} = require("./monriController");

const router = express.Router();

router.get("/redirect", redirectToMonri);

// Monri will call these on payment success / cancel
router.post("/success", handleSuccess);
router.get("/success", handleSuccess);

router.post("/cancel", handleCancel);
router.get("/cancel", handleCancel);

module.exports = router;
