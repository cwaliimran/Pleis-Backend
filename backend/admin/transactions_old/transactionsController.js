const { sendResponse, getReadableErrorMessage, validateParams, convertTimezoneToUtc, parsePaginationParams } = require("@utils/responseUtil");
const {
  getTransactionsService, } = require("./transactionsService");


const getTransactions = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword, status = "active", date, range, organizations, companyOrganizer } = req.query;
    let { timezone } = req.user;
    if (
      (!companyOrganizer || companyOrganizer === "undefined" || companyOrganizer === "null") &&
      (!organizations || !Array.isArray(JSON.parse(organizations)) || JSON.parse(organizations).length === 0)
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "companyOrganizer_or_organizations_is_required",
      });
    }
    const userId = companyOrganizer;

    const transactions = await getTransactionsService({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      organizations,
      date,
      range
    });
    return sendResponse({ res, statusCode: 200, translationKey: "transactions_fetched_successfully", data: transactions });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

module.exports = { getTransactions };