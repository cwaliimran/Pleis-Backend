const express = require("express");
const {
  getMembers,
  giftPoints,
} = require("./clubMembersController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("ClubMembers");

router.get("/", apiRateLimiter, getMembers);
router.post("/gift-points", apiRateLimiter, giftPoints);

module.exports = router;
