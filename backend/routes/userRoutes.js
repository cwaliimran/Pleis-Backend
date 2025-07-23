const express = require("express");
const auth = require("../middlewares/authMiddleware");

const {

  getUserProfile,
} = require("../controllers/userController");
const router = express.Router();

// Apply auth middleware to the router
router.use(auth);


router.get("/profile", (req, res, next) => {
  // Pass 'suppliers' to fieldsToPopulate argument
  getUserProfile(req, res, next, ["suppliers"]);
});

module.exports = router;
