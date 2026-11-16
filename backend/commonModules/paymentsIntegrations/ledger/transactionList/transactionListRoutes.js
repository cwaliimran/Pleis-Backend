/**
 * GET /admin/transaction-ledger            list (+ stats, meta)
 * GET /admin/transaction-ledger/export     CSV of the filtered rows
 * GET /admin/transaction-ledger/:id        one row (ledger id or order id)
 * Same paths under /organizer/… with the organizer visibility (#8).
 */
const express = require("express");
const { sendResponse, getReadableErrorMessage } = require("@utils/responseUtil");
const createRateLimiter = require("../../../../helperUtils/rateLimiter");
const { resolveTransactionScope } = require("./transactionScope");
const service = require("./transactionListService");

const auth = require("../../../../middlewares/authMiddleware");

const router = express.Router();
const rl = createRateLimiter("TransactionLedger");

// Role is checked per request in resolveTransactionScope (admin / organizer only).
router.use(auth);

const fail = (res, error) => {
  const err = getReadableErrorMessage(error);
  return sendResponse({
    res,
    statusCode: error?.statusCode || err.statusCode || 500,
    translationKey: error?.statusCode === 403 ? "forbidden" : err.message,
  });
};

router.get("/", rl, async (req, res) => {
  try {
    const scope = await resolveTransactionScope(req);
    const { rows, stats, meta } = await service.listTransactions(scope, req.query);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "transactions_fetched_successfully",
      data: { rows, stats, visibility: scope.isSuperAdmin ? "superadmin" : "organizer" },
      meta,
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.get("/export", rl, async (req, res) => {
  try {
    const scope = await resolveTransactionScope(req);
    const csv = await service.exportTransactionsCsv(scope, req.query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=pleis-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    return res.send(csv);
  } catch (error) {
    return fail(res, error);
  }
});

router.get("/:id", rl, async (req, res) => {
  try {
    const scope = await resolveTransactionScope(req);
    const row = await service.getTransaction(scope, req.params.id);
    if (!row) {
      return sendResponse({ res, statusCode: 404, translationKey: "transaction_not_found" });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "transaction_details_fetched_successfully",
      data: row,
    });
  } catch (error) {
    return fail(res, error);
  }
});

module.exports = router;
