const express = require("express");
const {
  create,
  get,
  getDetails,
  update,
  deleteItem,
  getV2,
  getAllTypes,
} = require("./rewardsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Rewards");
const apiRateLimiterDetails = createRateLimiter("Rewards/:id");

router.post("/", roleMiddleware(["admin", "organizer", "manager"]), create);
router.get("/", apiRateLimiter, get);
router.get("/types", apiRateLimiter, getAllTypes);
router.get("/v2", apiRateLimiter, getV2);
router.get("/:id", apiRateLimiterDetails, getDetails);
router.put("/:id", roleMiddleware(["admin", "organizer", "manager"]), update);
router.delete("/:id", roleMiddleware(["admin", "organizer", "manager"]), deleteItem);

module.exports = router;
