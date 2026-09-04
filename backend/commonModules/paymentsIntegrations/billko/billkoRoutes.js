const express = require("express");
const { billkoCallbackController } = require("./billkoCallbackController");

const router = express.Router();

router.post("/callback", express.json({ type: "*/*" }), billkoCallbackController);

module.exports = router;
