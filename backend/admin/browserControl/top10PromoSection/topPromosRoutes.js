const express = require("express");
const {
  createTopPromo,
  getTopPromos,
  updateTopPromo,
  deleteTopPromo,
  reorderTopPromo,
} = require("./topPromosController");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);
router.use(roleMiddleware(["admin"]));

// Create a new topPromo
router.post("/", createTopPromo);

// Get all topPromos with pagination
router.get("/", getTopPromos);

// Update an existing topPromo
router.put("/:id", updateTopPromo);

// Delete a topPromo
router.delete("/:id", deleteTopPromo);

// Reorder topPromos
router.post("/reorder", reorderTopPromo);

module.exports = router;
