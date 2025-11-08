const express = require("express");
const {
  createChallenge,
  getChallenges,
  getChallengeDetails,
  updateChallenge,
  deleteChallenge,
} = require("./challengesController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Challenges");
const apiRateLimiterDetails = createRateLimiter("Challenges/:id");

router.post("/", roleMiddleware(["admin", "organizer", "manager"]), createChallenge);
router.get("/", apiRateLimiter, getChallenges);
router.get("/:id", apiRateLimiterDetails, getChallengeDetails);
router.put("/:id", roleMiddleware(["admin", "organizer", "manager"]), updateChallenge);
router.delete("/:id", roleMiddleware(["admin", "organizer", "manager"]), deleteChallenge);

module.exports = router;
