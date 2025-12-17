const express = require("express");
const {
  joinClub,
  leaveClub,
  getUserJoinedClubsWithPoints,
  getSuggestedClubs,
  getUserCompanyWallet,
  getCompanyProfileWithLoyaltyInfo,
} = require("./clubMembersController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("ClubMembers");

//get all joined clubs
router.get("/joined-clubs", apiRateLimiter, getUserJoinedClubsWithPoints);
router.get("/suggested-clubs", apiRateLimiter, getSuggestedClubs);
router.get("/wallet/:id", apiRateLimiter, getUserCompanyWallet);
router.get("/:id", apiRateLimiter, getCompanyProfileWithLoyaltyInfo);
router.post("/join", apiRateLimiter, joinClub);
router.post("/leave", apiRateLimiter, leaveClub);

module.exports = router;
