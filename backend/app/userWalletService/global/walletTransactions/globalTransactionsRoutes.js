const express = require("express");
const {
  createGlobalTransaction,
  getGlobalTransactions,
  updateGlobalTransaction,
  deleteGlobalTransaction,
  getGlobalTransactionDetails,
} = require("./globalTransactionsController");
const createRateLimiter = require("../../../../helperUtils/rateLimiter");
const auth = require("../../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for GlobalTransactions
const apiRateLimiter = createRateLimiter("GlobalTransactions");
const apiRateLimiterDetails = createRateLimiter("GlobalTransactions/:id");

// Create a new globalTransaction
router.post("/", roleMiddleware(["admin", "organizer", "staff", "manager", "user"]), createGlobalTransaction);

// Get all globalTransactions with pagination
router.get("/", apiRateLimiter, getGlobalTransactions);

// (Optional) endpoint to list transactions with filters
router.get("/", apiRateLimiter, getGlobalTransactions);

//get globalTransaction details
router.get("/:id", apiRateLimiterDetails, getGlobalTransactionDetails);

// Update an existing globalTransaction
router.put("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), updateGlobalTransaction);

// Delete a globalTransaction
router.delete("/:id", roleMiddleware(["admin", "organizer", "staff", "manager"]), deleteGlobalTransaction);


module.exports = router;
