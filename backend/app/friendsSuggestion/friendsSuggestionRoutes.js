const express = require("express");
const {
  getFriends,
} = require("./friendsSuggestionController"); 
const auth = require("../../middlewares/authMiddleware");
const router = express.Router();
router.use(auth);
router.post("/", getFriends);

module.exports = router;
