const { default: mongoose } = require("mongoose");
const { processPaymentWebhook, getOrdersTransactionsService, getOrdersTransactionDetailsService, getTransactionStatsService } = require("../services/paymentWebhookService");
const { verifyMonriSignature } = require("../utils/monriSignature");
const { parsePaginationParams, sendResponse, getReadableErrorMessage, validateParams } = require("../../../../helperUtils/responseUtil");
const { resolveTransactionScope } = require("../../ledger/transactionList/transactionScope");

/**
 * Was this order_number captured at Monri? Our MonriTransaction is "paid" only
 * after a digest-verified success URL or the reconcile job; otherwise ask
 * Monri now. Not confirmed → no transaction row; if the money was in fact
 * captured, the reconcile job fulfils it later through the same path.
 */
// #10 / #25: shared server-side capture check (Monri status query).
const { confirmMonriCapture } = require("../../monri/monriCaptureCheck");

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


    // #10: this endpoint is called by the guest app, so its "paid" is a claim,
    // not a capture. Accept it only when Monri confirms the capture.
    if (String(bodyData?.transaction?.status || "").toLowerCase() === "paid") {
      const capture = await confirmMonriCapture(String(bodyData.transaction.orderNumber));
      if (!capture.confirmed) {
        return res.status(202).json({
          received: true,
          processed: false,
          reason: capture.reason,
        });
      }
    }

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
    const SORT_FIELDS = ["userName", "createdAt", "organizationName","email"];
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
    const timezone = req.user?.timezone || "UTC";

    // #8: admin global or a chosen company; organizer only their own company;
    // manager only assigned organizations. A requested organization outside
    // the scope is dropped, never honoured.
    const scope = await resolveTransactionScope({
      user: req.user,
      query: { companyOrganizer, organizations: organization },
    });
    companyOrganizer = undefined;
    organization = scope.organizations;
    // #10: a row exists only for a captured payment (and its refund). Pending,
    // failed or abandoned attempts are payment attempts, not transactions.
    if (!paymentStatus && !status) {
      paymentStatus = { $in: ["paid", "refunded"] };
    } else if (!["paid", "refunded"].includes(paymentStatus || status)) {
      return sendResponse({ res, statusCode: 200, translationKey: "transactions_fetched_successfully", data: { transactions: [], meta: { page, limit, total: 0 } } });
    }

    const ticketingBookings = await getOrdersTransactionsService({ isSuperAdmin: scope.isSuperAdmin, event, page, limit, keyword, status, date, orderType, companyOrganizer, organization, startDate, endDate, startAmount, endAmount, paymentMethod, globalStatusLevel, transfered, refunded, validationStatus, paymentStatus, resStartDate, resEndDate, resDate, resStartTime, resEndTime, timezone, futureRes, pastRes, paidRes, minimalSpendRes, prePay, ticketRequiredRes, cancelledRes, noShowRes, orderStatus, deliveryMethod, category, menuSaleItme, promotionOrders, eventBasedOrder, sortBy, sortOrder });
    return sendResponse({ res, statusCode: 200, translationKey: "transactions_fetched_successfully", data: ticketingBookings });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: error?.statusCode || readableError.statusCode, translationKey: error?.statusCode === 403 ? "forbidden" : readableError.message, error });
  }
};

const getOrdersTransactionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendResponse({ res, statusCode: 400, translationKey: "invalid_transaction_id" });
    }
    const scope = await resolveTransactionScope({ user: req.user, query: {} });
    const transactionDetails = await getOrdersTransactionDetailsService({ id, scope });
    if (!transactionDetails) {
      return sendResponse({ res, statusCode: 404, translationKey: "transaction_not_found" });
    }
    return sendResponse({ res, statusCode: 200, translationKey: "transaction_details_fetched_successfully", data: transactionDetails });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: error?.statusCode || readableError.statusCode, translationKey: error?.statusCode === 403 ? "forbidden" : readableError.message, error });
  }
};
const getTransactionStats = async (req, res) => {
  let { dateFilter = "all", companyOrganizer, organizations } = req.query;
  dateFilter = dateFilter.trim();
  let { timezone } = req.user || "UTC";
  try {
    const scope = await resolveTransactionScope({
      user: req.user,
      query: { companyOrganizer, organizations },
    });
    companyOrganizer = undefined;
    organizations = scope.organizations;
    req.transactionScope = scope;
    if (dateFilter && !validateParams(req, res, {
      enumFields: {
        dateFilter: ["all", "today", "thisWeek", "thisMonth"],
      },
    })) return;

    const dashboard = await getTransactionStatsService({
      isSuperAdmin: req.transactionScope.isSuperAdmin,
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
      statusCode: error?.statusCode || 500,
      translationKey: error?.statusCode === 403 ? "forbidden" : "internal_server",
      error,
    });
  }
};


module.exports = { monriWebhookController, getOrdersTransactions, getOrdersTransactionDetails, getTransactionStats };
