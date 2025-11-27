const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const globalTransactionsService = require("./globalTransactionsService");

const createGlobalTransaction = async (req, res) => {
  const {
    user,
    type,
    points,
    closingBalance,
    description = "",
    objectType,
    objectId
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["user", "type"],
      objectIdFields: ["user"],
    })
  )
    return;

  if (!points || points.base === undefined || points.total === undefined || closingBalance === undefined) {
    return sendResponse({ res, statusCode: 400, translationKey: "invalid_points_payload" });
  }

  const data = {
    user,
    type,
    points,
    closingBalance,
    description,
    objectType,
    objectId
  };

  try {
    const tx = await globalTransactionsService.createGlobalTransaction(data);
    if (!tx) {
      return sendResponse({ res, statusCode: 400, translationKey: "wallet_transaction_creation_failed" });
    }
    return sendResponse({ res, statusCode: 201, translationKey: "wallet_transaction_created" });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const getGlobalTransactions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { user, type, date } = req.query;
  try {
    const { globalTransactions, meta } = await globalTransactionsService.getGlobalTransactions({ page, limit, user, type, date });
    return sendResponse({ res, statusCode: 200, translationKey: "wallet_transactions_fetched", data: globalTransactions, meta });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const getGlobalTransactionDetails = async (req, res) => {
  const { id } = req.params;
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const tx = await globalTransactionsService.getGlobalTransactionDetails(id);
    if (!tx) return sendResponse({ res, statusCode: 404, translationKey: "wallet_transaction_not_found" });
    return sendResponse({ res, statusCode: 200, translationKey: "wallet_transaction_fetched", data: tx });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const updateGlobalTransaction = async (req, res) => {
  const { id } = req.params;
  const { type,  points, closingBalance, description } = req.body;

  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;

  try {
    const updated = await globalTransactionsService.updateGlobalTransaction(id, { type, points, closingBalance, description });
    if (!updated) return sendResponse({ res, statusCode: 404, translationKey: "wallet_transaction_not_found" });
    return sendResponse({ res, statusCode: 200, translationKey: "wallet_transaction_updated", data: updated });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const deleteGlobalTransaction = async (req, res) => {
  const { id } = req.params;
  if (!validateParams(req, res, { pathParams: ["id"], objectIdFields: ["id"] })) return;
  try {
    const deleted = await globalTransactionsService.deleteGlobalTransaction(id);
    if (!deleted) return sendResponse({ res, statusCode: 404, translationKey: "wallet_transaction_not_found" });
    return sendResponse({ res, statusCode: 200, translationKey: "wallet_transaction_deleted" });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

module.exports = {
  createGlobalTransaction,
  getGlobalTransactions,
  updateGlobalTransaction,
  deleteGlobalTransaction,
  getGlobalTransactionDetails,
};
