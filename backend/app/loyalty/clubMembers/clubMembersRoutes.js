const express = require("express");
const {
  joinClub,
  leaveClub,
} = require("./clubMembersController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("ClubMembers");

router.post("/join", apiRateLimiter, joinClub);
router.post("/leave", apiRateLimiter, leaveClub);

module.exports = router;
