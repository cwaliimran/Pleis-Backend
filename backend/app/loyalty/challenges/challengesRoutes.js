const express = require("express");
const {
  getChallenges,
  getChallengeDetails,
} = require("./challengesController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Challenges");
const apiRateLimiterDetails = createRateLimiter("Challenges/:id");

router.get("/", apiRateLimiter, getChallenges);
router.get("/:id", apiRateLimiterDetails, getChallengeDetails);

module.exports = router;
