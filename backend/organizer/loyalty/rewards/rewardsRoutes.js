const express = require("express");
const {
  redeemReward,
  create,
  get,
  getDetails,
  update,
  deleteItem,
} = require("./rewardsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Rewards");
const apiRateLimiterDetails = createRateLimiter("Rewards/:id");

router.post("/redeem-reward", roleMiddleware(["admin", "organizer", "manager"]), redeemReward);
router.post("/", roleMiddleware(["admin", "organizer", "manager"]), create);
router.get("/", apiRateLimiter, get);
router.get("/:id", apiRateLimiterDetails, getDetails);
router.put("/:id", roleMiddleware(["admin", "organizer", "manager"]), update);
router.delete("/:id", roleMiddleware(["admin", "organizer", "manager"]), deleteItem);

module.exports = router;
