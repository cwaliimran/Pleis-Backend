const express = require("express");
const {
  redirectToMonri,
  handleSuccess,
  handleCancel,
  createClientSecret,
} = require("./monriController");

const router = express.Router();

router.get("/redirect", redirectToMonri);
router.post("/payment-intent", createClientSecret);


// Monri will call these on payment success / cancel
router.post("/success", handleSuccess);
router.get("/success", handleSuccess);

router.post("/cancel", handleCancel);
router.get("/cancel", handleCancel);


module.exports = router;
