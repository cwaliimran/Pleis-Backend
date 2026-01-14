const express = require("express");
const {
  create,
  get,
  getDetails,
  update,
  deleteItem,
} = require("./promotionsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

const apiRateLimiter = createRateLimiter("Promotions");
const apiRateLimiterDetails = createRateLimiter("Promotions/:id");

router.post("/", roleMiddleware([ "organizer"]), create);
router.get("/", apiRateLimiter, get);
router.get("/:id", apiRateLimiterDetails, getDetails);
router.put("/:id", roleMiddleware(["organizer"]), update);
router.delete("/:id", roleMiddleware(["organizer"]), deleteItem);

module.exports = router;
