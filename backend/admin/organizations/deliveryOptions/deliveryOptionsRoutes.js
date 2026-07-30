const express = require("express");
const {
  createDeliveryOption,
  getDeliveryOptions,
  getDeliveryOptionDetails,
  updateDeliveryOption,
  deleteDeliveryOption,
} = require("./deliveryOptionsController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router({ mergeParams: true });

router.use(auth);

const apiRateLimiter = createRateLimiter("DeliveryOptions");
const apiRateLimiterDetails = createRateLimiter("DeliveryOptions/:id");

router.post(
  "/",
  roleMiddleware(["admin", "organizer", "manager", "staff"]),
  createDeliveryOption,
);

router.get("/", apiRateLimiter, getDeliveryOptions);
router.get("/:id", apiRateLimiterDetails, getDeliveryOptionDetails);

router.put(
  "/:id",
  roleMiddleware(["admin", "organizer", "manager", "staff"]),
  updateDeliveryOption,
);

router.delete(
  "/:id",
  roleMiddleware(["admin", "organizer", "manager", "staff"]),
  deleteDeliveryOption,
);

module.exports = router;
