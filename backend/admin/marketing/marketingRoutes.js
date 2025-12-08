const express = require("express");
const {
  createMarketing,
  getMarketings,
  getMarketingDetails,
  updateMarketing,
  deleteMarketing,
  getUserMarketings
} = require("./marketingController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("Marketings");
const apiRateLimiterDetails = createRateLimiter("Marketings/:id");
router.post("/", roleMiddleware(["admin", "organizer", "manager"]), createMarketing);
router.get("/", apiRateLimiter, getMarketings);
router.get("/user", apiRateLimiter, getUserMarketings);
router.get("/:id", apiRateLimiterDetails, getMarketingDetails);
router.put("/:id", roleMiddleware(["admin", "organizer", "manager"]), updateMarketing);
router.delete("/:id", roleMiddleware(["admin", "organizer", "manager"]), deleteMarketing);
module.exports = router;
