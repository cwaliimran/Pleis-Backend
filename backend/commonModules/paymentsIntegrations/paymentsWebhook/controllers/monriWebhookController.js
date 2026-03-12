const { default: mongoose } = require("mongoose");
const { processPaymentWebhook, getOrdersTransactionsService, getOrdersTransactionDetailsService } = require("../services/paymentWebhookService");
const { verifyMonriSignature } = require("../utils/monriSignature");
const { parsePaginationParams, sendResponse, getReadableErrorMessage, validateParams } = require("../../../../helperUtils/responseUtil");

const monriWebhookController = async (req, res) => {
  try {
    // verifyMonriSignature(req);

    let { _id: userId } = req.user


    const bodyData = req.body;
    bodyData.user = userId;

    if (
      !validateParams(req, res, {
        rawData: ["transaction.metadata.companyOrganizer", "transaction.metadata.organization", "transaction.orderNumber", "transaction.metadata.type"],
        objectIdFields: ["transaction.metadata.companyOrganizer", "transaction.metadata.organization", "transaction.orderNumber"],
        enumFields: { "transaction.metadata.type": ["ticketingbookings", "userreservations", "menuorders", "tickettransfer"] },
      })
    ) return;


    const result = await processPaymentWebhook({
      provider: "monri",
      payload: bodyData,
    });

    // ✅ Always return 200, but with clarity
    return res.status(200).json({
      received: true,
      processed: result.handled,
      reason: result.reason || null,
    });
  } catch (err) {
    console.error("Webhook error:", err);

    // ❌ Only reject if truly invalid
    return res.status(400).json({
      received: false,
      error: "invalid_webhook",
    });
  }
};


const getOrdersTransactions = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword, status, date, orderType, companyOrganizer, organization, startDate, endDate, } = req.query;
    const ticketingBookings = await getOrdersTransactionsService({ page, limit, keyword, status, date, orderType, companyOrganizer, organization, startDate, endDate, });
    return sendResponse({ res, statusCode: 200, translationKey: "transactions_fetched_successfully", data: ticketingBookings });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const getOrdersTransactionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse({ res, statusCode: 400, translationKey: "invalid_transaction_id" });
    }
    const transactionDetails = await getOrdersTransactionDetailsService({ id });
    if (!transactionDetails) {
      return sendResponse({ res, statusCode: 404, translationKey: "transaction_not_found" });
    }
    return sendResponse({ res, statusCode: 200, translationKey: "transaction_details_fetched_successfully", data: transactionDetails });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};



module.exports = { monriWebhookController, getOrdersTransactions, getOrdersTransactionDetails };
