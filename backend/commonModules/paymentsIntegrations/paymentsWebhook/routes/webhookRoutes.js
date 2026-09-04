const express = require("express");
const router = express.Router();

const { monriWebhookController, getOrdersTransactions, getOrdersTransactionDetails,getTransactionStats } =
  require("../controllers/monriWebhookController");
const auth = require("../../../../middlewares/authMiddleware");

router.post("/payments/monri", auth, express.json({ type: "*/*" }), monriWebhookController);
router.use("/billko", require("../../billko/billkoRoutes"));

//get all transactions
router.get("/orders-transactions", auth, getOrdersTransactions)
router.get("/orders-transactions/analytics", auth, getTransactionStats)
router.get("/orders-transactions/:id", auth, getOrdersTransactionDetails)

module.exports = router;
