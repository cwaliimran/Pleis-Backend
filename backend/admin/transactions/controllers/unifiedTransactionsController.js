// controllers/unifiedTransactionsController.js
const {
    sendResponse,
    parsePaginationParams,
    validateParams,
    getReadableErrorMessage
} = require("@utils/responseUtil");
const unifiedService = require("../services/unifiedTransactionsService");

const createTransaction = async (req, res) => {
    const {
        user,
        companyOrganizer = null,
        organization = null,
        type = "earn",
        domainType,
        entityId = null,
        companyPoints = null,
        globalPoints = null,
        allowNegative = false,
        description = ""
    } = req.body;

    if (!validateParams(req, res, {
        rawData: ["user", "domainType", "type"],
        objectIdFields: ["user", "companyOrganizer", "organization"]
    })) return;

    if (companyPoints === null && globalPoints === null) {
        return sendResponse({ res, statusCode: 400, translationKey: "invalid_points_payload" });
    }

    try {
        const result = await unifiedService.createTransaction({
            user,
            companyOrganizer,
            organization,
            type,
            domainType,
            entityId,
            companyPoints,
            globalPoints,
            allowNegative,
            description
        });

        return sendResponse({ res, statusCode: 201, translationKey: "wallet_transaction_created", data: result });
    } catch (e) {
        const err = getReadableErrorMessage(e);

        return sendResponse({ res, statusCode: err.statusCode ?? 400, translationKey: err.message });
    }
};

const getTransactions = async (req, res) => {
    const { page, limit } = parsePaginationParams(req);
    const {
        walletType, domainType, type, organization, companyOrganizer, entityId, startDate, endDate, keyword
    } = req.query;

    try {
        const { items, meta } = await unifiedService.getTransactions({
            page, limit, walletType, domainType, type, organization, companyOrganizer, entityId, startDate, endDate, keyword
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

const deleteTransaction = async (req, res) => {
    const { id } = req.params;
    if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;

    try {
        const deleted = await unifiedService.deleteTransaction(id);
        if (!deleted) return sendResponse({ res, statusCode: 404, translationKey: "wallet_transaction_not_found" });
        return sendResponse({ res, statusCode: 200, translationKey: "wallet_transaction_deleted" });
    } catch (error) {
        const err = getReadableErrorMessage(error);
        return sendResponse({ res, statusCode: err.statusCode ?? 500, translationKey: err.message });
    }
};

module.exports = {
    createTransaction,
    getTransactions,
    getTransactionDetails,
    updateTransaction,
    deleteTransaction
};
