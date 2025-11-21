const { sendResponse, getReadableErrorMessage, validateParams, convertTimezoneToUtc, parsePaginationParams } = require("@utils/responseUtil");
const {
  getTransactionsService, } = require("./transactionsService");


const getTransactions = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword, status, date, orderSort } = req.query;
    let { timezone, _id: userId } = req.user;
    const transactions = await getTransactionsService({ page, limit, keyword, status, date, orderSort, timezone, userId });
    return sendResponse({ res, statusCode: 200, translationKey: "transactions_fetched_successfully", data: transactions });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

module.exports = { getTransactions };