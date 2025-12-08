const express = require("express");
const auth = require("../../../../middlewares/authMiddleware");
const { getUserWallet } = require("./userWalletController");

const router = express.Router();

router.use(auth);

// GET /user-wallet - fetch or create user wallet
router.get("/", getUserWallet);

module.exports = router;
