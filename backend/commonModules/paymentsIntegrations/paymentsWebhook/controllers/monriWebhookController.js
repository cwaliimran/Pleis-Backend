const { default: mongoose } = require("mongoose");
const { processPaymentWebhook, getOrdersTransactionsService, getOrdersTransactionDetailsService, getTransactionStatsService } = require("../services/paymentWebhookService");
const { verifyMonriSignature } = require("../utils/monriSignature");
const { parsePaginationParams, sendResponse, getReadableErrorMessage, validateParams } = require("../../../../helperUtils/responseUtil");
const convertToMongoArray = require("@utils/convertToMongoArray");

const monriWebhookController = async (req, res) => {
  try {
    // verifyMonriSignature(req);

    let { _id: userId } = req.user


    const bodyData = req.body;
    bodyData.user = userId;
    console.log("bodyData", bodyData);

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
    let { event, keyword, status, date, orderType, companyOrganizer, organization, startDate, endDate, startAmount, endAmount, paymentMethod, globalStatusLevel, transfered, refunded, validationStatus, paymentStatus, resStartDate, resEndDate, resDate, resStartTime, resEndTime, futureRes, pastRes, paidRes, minimalSpendRes, prePay, ticketRequiredRes, cancelledRes, noShowRes, orderStatus, deliveryMethod, category, menuSaleItme, promotionOrders, eventBasedOrder, sortBy, sortOrder
    } = req.query;
    const SORT_FIELDS = ["userName", "createdAt", "organizationName"];
    const SORT_ORDERS = ["asc", "desc"];
    if ((sortBy && !SORT_FIELDS.includes(sortBy)) || (sortOrder && !SORT_ORDERS.includes(sortOrder))) {
      const key = sortBy && !SORT_FIELDS.includes(sortBy)
        ? "invalid_sort_by_field"
        : "invalid_sort_order";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }

    if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
      const key = sortBy ? "sort_order_required_when_sort_by_is_provided"
        : "sort_by_required_when_sort_order_is_provided";
      return sendResponse({ res, statusCode: 400, translationKey: key });
    }
    if (organization) {
      // If organization is a non-empty string, convert it to ObjectId array
      if (!Array.isArray(organization)) {
        organization = await convertToMongoArray(organization);
      }
    } else {
      // If organization is empty, set it to undefined or an empty array
      organization = undefined;
    }
    const timezone = req.user?.timezone || "UTC";

    if (!companyOrganizer) {
      if (req.user.userType === "organizer") {
        companyOrganizer = req.user._id;
      }
    }
    if (organization) {
      companyOrganizer = undefined; // If organization filter is applied, ignore companyOrganizer filter
    }

    const ticketingBookings = await getOrdersTransactionsService({ event, page, limit, keyword, status, date, orderType, companyOrganizer, organization, startDate, endDate, startAmount, endAmount, paymentMethod, globalStatusLevel, transfered, refunded, validationStatus, paymentStatus, resStartDate, resEndDate, resDate, resStartTime, resEndTime, timezone, futureRes, pastRes, paidRes, minimalSpendRes, prePay, ticketRequiredRes, cancelledRes, noShowRes, orderStatus, deliveryMethod, category, menuSaleItme, promotionOrders, eventBasedOrder, sortBy, sortOrder });
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
const getTransactionStats = async (req, res) => {
  let { dateFilter = "all", companyOrganizer, organizations } = req.query;
  dateFilter = dateFilter.trim();
  let { timezone } = req.user || "UTC";
  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id;
    if (organizations) {
      organizations = await convertToMongoArray(organizations);
      companyOrganizer = undefined;
    }
  }
  console.log("organizations", organizations);
  try {
    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const dashboard = await getTransactionStatsService({
      dateFilter,
      timezone,
      companyOrganizer,
      organizations
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "transaction_stats_fetched_successfully",
      data: dashboard,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};


module.exports = { monriWebhookController, getOrdersTransactions, getOrdersTransactionDetails, getTransactionStats };
