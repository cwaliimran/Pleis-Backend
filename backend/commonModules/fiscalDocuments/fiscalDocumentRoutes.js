const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const {
  getConfirmationDocument,
  getInvoiceDocument,
} = require("./fiscalDocumentController");
const { openConfirmationInApp } = require("./openAppRedirect");

const router = express.Router();
router.get("/open", openConfirmationInApp);
router.use(auth);
router.get("/confirmations/:confirmationNumber", getConfirmationDocument);
router.get("/invoices/:id", getInvoiceDocument);

module.exports = router;
