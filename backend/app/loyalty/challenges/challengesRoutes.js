const express = require("express");
const {
  getChallenges,
  getChallengeDetails,
  getChallengesWithPagination,
} = require("./challengesController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Challenges");
const apiRateLimiterDetails = createRateLimiter("Challenges/:id");

router.get("/by-company/:companyOrganizer", apiRateLimiter, getChallenges);
router.get("/joined-clubs", apiRateLimiter, getChallengesWithPagination);
router.get("/:id", apiRateLimiterDetails, getChallengeDetails);

module.exports = router;
