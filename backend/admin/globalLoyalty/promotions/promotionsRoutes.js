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

router.post("/", roleMiddleware(["admin"]), create);
router.get("/", apiRateLimiter, get);
router.get("/:id", apiRateLimiterDetails, getDetails);
router.put("/:id", roleMiddleware(["admin"]), update);
router.delete("/:id", roleMiddleware(["admin"]), deleteItem);
module.exports = router;
