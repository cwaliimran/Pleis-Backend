const express = require("express");
const router = express.Router();

const auth = require("../../../../middlewares/authMiddleware");

const {
  saveUserCard,
  getUserCards,
  deleteUserCard,
  setDefaultCard,
  chargeSavedCard
} = require("../controllers/userCardController");


router.post("/", auth, saveUserCard);

router.post("/charge", auth, chargeSavedCard);

router.get("/", auth, getUserCards);

router.delete("/:id", auth, deleteUserCard);

router.patch("/:cardId/default", auth, setDefaultCard);

module.exports = router;