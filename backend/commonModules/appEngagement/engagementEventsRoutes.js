const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const {
  logEngagement,
  getTrending,
} = require("./engagementEventsController");

const router = express.Router();

router.use(auth);

/* 
example log engagement request body:
{
  "entityType": "organization",
  "entityId": "691580a7750069869d13db94",
  "action": "click"
}

*/
router.post("/log", logEngagement);
router.get("/trending", getTrending);

module.exports = router;
