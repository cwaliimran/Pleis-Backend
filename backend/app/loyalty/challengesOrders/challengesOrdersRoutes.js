const express = require("express");
const {
  updateChallengeByTaskType,
  getUserOrders,
} = require("./challengeOrdersController");

const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");

const router = express.Router();

// Require authentication
router.use(auth);

const apiRateLimiter = createRateLimiter("ChallengeOrders");
const apiRateLimiterDetails = createRateLimiter("ChallengeOrders/:id");

/* -------------------------------------------------------
   Challenge Orders API
-------------------------------------------------------- */
/* 
{
    "companyOrganizer": "6911c14b6fc7cbd864e745b6",
    "taskType": "earnPoints", //visit/buyMenuItem/referUsers/earnPoints
    "value": 500
}
*/
router.post(
  "/by-task-type",
  apiRateLimiter,
  updateChallengeByTaskType
);


// Get all challenge orders for logged-in user
router.get("/", apiRateLimiter, getUserOrders);

module.exports = router;
