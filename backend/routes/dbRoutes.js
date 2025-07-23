// routes/bulkInsertRoutes.js
const express = require("express");
const { bulkInsertHandler, deleteCollectionHandler } = require("../controllers/dbController");
const admin = require("../middlewares/adminMiddleware");
const auth = require("../middlewares/authMiddleware");
const router = express.Router();

// Route for bulk insertion
router.post("/bulkInsert", auth, admin, bulkInsertHandler);
router.post("/deleteCollection", auth, admin, deleteCollectionHandler);

module.exports = router;
