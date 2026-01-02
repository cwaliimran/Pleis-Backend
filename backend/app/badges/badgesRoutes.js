const express = require("express");
const {
  addUserBadges,
  getBadgess,
detailBadgess
} = require("./badgesController"); // Assuming you have a separate controller for promo codes
const auth = require("../../middlewares/authMiddleware");
const router = express.Router();
router.use(auth);



router.post("/", addUserBadges);
router.get("/", getBadgess);
router.get("/:id", detailBadgess);
module.exports = router;
