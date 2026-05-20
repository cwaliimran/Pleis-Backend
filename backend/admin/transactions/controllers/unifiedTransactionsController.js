// controllers/unifiedTransactionsController.js
const {
    sendResponse,
    parsePaginationParams,
    validateParams,
    getReadableErrorMessage
} = require("@utils/responseUtil");
const unifiedService = require("../services/unifiedTransactionsService");

const getTransactions = async (req, res) => {
    const { page, limit } = parsePaginationParams(req);
    let {
        walletType, domainType, type, organization, companyOrganizer, entityId, startDate, date, endDate, keyword, user, startPoints, endPoints, ballance, referral, purchaseBased, streakBased, challengeBased, promotionBased, sortBy, sortOrder


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

    if (req.user.userType === "organizer") {
        companyOrganizer = req.user._id;
    }
    if (walletType = "companyLoyalty") {
        organization = undefined;
    }
    try {
        const { items, meta } = await unifiedService.getTransactionsService({
            page, limit, walletType, domainType, type, organization, companyOrganizer, entityId, startDate, date, endDate, keyword, user, startPoints, endPoints, ballance, referral, purchaseBased, streakBased, challengeBased, promotionBased, sortBy, sortOrder
        });
        return sendResponse({ res, statusCode: 200, translationKey: "wallet_transactions_fetched", data: items, meta });
    } catch (error) {
        const err = getReadableErrorMessage(error);
        return sendResponse({ res, statusCode: err.statusCode ?? 500, translationKey: err.message });
    }
};

const getTransactionDetails = async (req, res) => {
    const { id } = req.params;
    if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;

    try {
        const tx = await unifiedService.getTransactionDetails(id);
        if (!tx) return sendResponse({ res, statusCode: 404, translationKey: "wallet_transaction_not_found" });
        return sendResponse({ res, statusCode: 200, translationKey: "wallet_transaction_fetched", data: tx });
    } catch (error) {
        const err = getReadableErrorMessage(error);
        return sendResponse({ res, statusCode: err.statusCode ?? 500, translationKey: err.message });
    }
};

const updateTransaction = async (req, res) => {
    const { id } = req.params;
    const { type, domainType, points, closingBalance, description } = req.body;

    if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;

    try {
        const updated = await unifiedService.updateTransaction(id, { type, domainType, points, closingBalance, description });
        if (!updated) return sendResponse({ res, statusCode: 404, translationKey: "wallet_transaction_not_found" });
        return sendResponse({ res, statusCode: 200, translationKey: "wallet_transaction_updated", data: updated });
    } catch (error) {
        const err = getReadableErrorMessage(error);
        return sendResponse({ res, statusCode: err.statusCode ?? 500, translationKey: err.message });
    }
};

const downloadTransactions = async (req, res) => {
    const { organization, companyOrganizer, startDate, endDate } = req.query;

    try {
        const csvString = await unifiedService.downloadTransactionsAsCSV({
            organization,
            companyOrganizer,
            startDate,
            endDate,
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=transactions_${Date.now()}.csv`
        );

        return res.send(csvString); // ✅ RAW RESPONSE
    } catch (error) {
        const err = getReadableErrorMessage(error);
        return sendResponse({
            res,
            statusCode: err.statusCode ?? 500,
            translationKey: err.message,
        });
    }
};


module.exports = {
    getTransactions,
    getTransactionDetails,
    updateTransaction,
    downloadTransactions
};
