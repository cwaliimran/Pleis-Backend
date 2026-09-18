/**
 * NEW additive admin routes for Phase B payout statements + Phase C Fiscalize
 * + Imperial Lake B2B document / payment reporting.
 * Mounted at /api/v1/admin/payout-statements and /api/v1/admin/payouts
 *
 * Phase B:
 * POST   /statements
 * GET    /statements
 * GET    /statements/:id
 * GET    /statements/:id/pain001
 * POST   /statements/:id/confirm
 * POST   /statements/:id/cancel
 * POST   /ledger-entries/:entryId/exclude
 *
 * Phase C (additive):
 * POST   /fiscalize
 * GET    /fiscalize/runs
 * POST   /off-app-batches
 * GET    /off-app-batches
 * GET    /off-app-batches/:id
 * POST   /off-app-batches/:id/confirm
 * POST   /off-app-batches/:id/cancel
 *
 * Imperial Lake B2B (additive; gated by BILLKO_LAKE_ENABLED + credentials):
 * GET    /billko/status
 * GET    /billko/incoming
 * GET    /billko/outgoing
 * GET    /billko/documents/:documentId
 * POST   /billko/documents/:documentId/report-payment
 */
const express = require("express");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const controller = require("../../commonModules/paymentsIntegrations/ledger/payoutStatementController");

const router = express.Router();
const rl = createRateLimiter("PayoutStatements");

router.post("/statements", rl, controller.generate);
router.get("/statements", rl, controller.list);
router.get("/statements/:id/pain001", rl, controller.download);
router.post("/statements/:id/confirm", rl, controller.confirm);
router.post("/statements/:id/cancel", rl, controller.cancel);
router.get("/statements/:id", rl, controller.getOne);
router.post("/ledger-entries/:entryId/exclude", rl, controller.excludeEntry);

router.post("/fiscalize", rl, controller.fiscalize);
router.get("/fiscalize/runs", rl, controller.listFiscalizeRuns);

router.post("/off-app-batches", rl, controller.generateOffApp);
router.get("/off-app-batches", rl, controller.listOffApp);
router.get("/off-app-batches/:id", rl, controller.getOffApp);
router.post("/off-app-batches/:id/confirm", rl, controller.confirmOffApp);
router.post("/off-app-batches/:id/cancel", rl, controller.cancelOffApp);

router.get("/billko/status", rl, controller.billkoLakeStatus);
router.get("/billko/incoming", rl, controller.billkoIncoming);
router.get("/billko/outgoing", rl, controller.billkoOutgoing);
router.get("/billko/documents/:documentId", rl, controller.billkoDocumentStatus);
router.post(
  "/billko/documents/:documentId/report-payment",
  rl,
  controller.billkoReportPayment,
);

module.exports = router;
