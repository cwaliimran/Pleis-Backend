const express = require("express");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);



//payment-methods


router.use("/payment-methods", require("./paymentMethod/paymentMethodRoutes"));





module.exports = router;
