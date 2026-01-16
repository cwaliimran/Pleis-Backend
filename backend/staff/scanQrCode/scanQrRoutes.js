const express = require("express");
const {
  scanQrController,
  scanQrControllerManual
} = require("./scanQrController");

const router = express.Router();

router.post("/", scanQrController);


module.exports = router;
