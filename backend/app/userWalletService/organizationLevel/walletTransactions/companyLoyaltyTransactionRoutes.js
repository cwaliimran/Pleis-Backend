const express = require("express");
const auth = require("../../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../../middlewares/roleMiddleware");
const createRateLimiter = require("../../../../helperUtils/rateLimiter");

const {
  createCompanyTransaction,
  getCompanyTransactions,
  getCompanyTransactionDetails,
  updateCompanyTransaction,
  deleteCompanyTransaction
} = require("./companyLoyaltyTransactionController");

const router = express.Router();

router.use(auth);

const rl = createRateLimiter("CompanyTransactions");
const rlDetails = createRateLimiter("CompanyTransactions/:id");

router.post("/", createCompanyTransaction);
router.get("/", rl, getCompanyTransactions);
router.get("/:id", rlDetails, getCompanyTransactionDetails);
router.put("/:id", updateCompanyTransaction);
router.delete("/:id", deleteCompanyTransaction);

module.exports = router;
