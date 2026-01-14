const express = require("express");
const {
  createBundle,
  getBundles,
  getBundleById,
  updateBundle,
  deleteBundle,
} = require("./bundleController");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);

router.post("/", createBundle);
router.get("/", getBundles);
router.get("/:id", getBundleById);
router.put("/:id", updateBundle);
router.delete("/:id", deleteBundle);

module.exports = router;