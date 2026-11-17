const express = require("express");
const router = express.Router();

const auth = require("../../../../middlewares/authMiddleware");

const {
  saveUserCard,
  getUserCards,
  deleteUserCard,
  setDefaultCard,
  chargeSavedCard,
  startAddCard,
  addCardPage,
  completeAddCard,
  addCardResult
} = require("../controllers/userCardController");


router.post("/", auth, saveUserCard);

router.post("/charge", auth, chargeSavedCard);

router.get("/", auth, getUserCards);

// Profile > Payment methods > Add card (Monri v1.4 §5.1). The page and its
// result call run inside the WebView without the app's token: they are
// reached with the single-use page token issued by add-session.
router.post("/add-session", auth, startAddCard);
router.get("/add-page/:attemptId", addCardPage);
router.post("/add-complete/:attemptId", express.json(), completeAddCard);
router.get("/add-result", addCardResult);

router.delete("/:cardId", auth, deleteUserCard);

router.patch("/:cardId/default", auth, setDefaultCard);

module.exports = router;
