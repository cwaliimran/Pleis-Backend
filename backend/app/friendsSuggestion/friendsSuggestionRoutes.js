const express = require("express");
const {
  addContacts,
getFriendSuggestions
} = require("./friendsSuggestionController"); 
const auth = require("../../middlewares/authMiddleware");
const router = express.Router();
router.use(auth);
router.post("/", addContacts);
router.get("/", getFriendSuggestions);




module.exports = router;
