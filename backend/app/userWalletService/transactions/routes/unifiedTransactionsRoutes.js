// routes/unifiedTransactionsRoutes.js
const express = require("express");
const {
  // createTransaction,
  getTransactions,
  getTransactionDetails,
} = require("../controllers/unifiedTransactionsController");
const createRateLimiter = require("../../../../helperUtils/rateLimiter");
const auth = require("../../../../middlewares/authMiddleware");

const router = express.Router();
router.use(auth);

const rl = createRateLimiter("UnifiedTransactions");
const rlDetails = createRateLimiter("UnifiedTransactions/:id");

// // Create a transaction (allowed roles: admin, organizer, staff, manager, user)
// router.post("/", roleMiddleware(["admin", "organizer", "staff", "manager", "user"]), createTransaction);

// List with pagination
router.get("/", rl, getTransactions);

// Get details
router.get("/:id", rlDetails, getTransactionDetails);


module.exports = router;
