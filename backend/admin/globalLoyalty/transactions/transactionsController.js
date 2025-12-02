const { sendResponse, getReadableErrorMessage, validateParams, convertTimezoneToUtc, parsePaginationParams } = require("@utils/responseUtil");
const {
  getTransactionsService, } = require("./transactionsService");
  const {formatTransaction} = require("./formatters/transactionsFormatter");


const getTransactions = async (req, res) => {
 const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
  try {

const timezone = req.user?.timezone || "UTC";
    const { Transections, meta } = await getTransactionsService({
      page,
      limit,
      keyword,
      status,
      date,
      timezone,
    });
const formatedTransections = Transections.map(item =>
  formatTransaction(item, { timezone })
);

return sendResponse({
  res,
  statusCode: 200,
  translationKey: "Transactions_fetched_successfully",
  data: formatedTransections,
  meta,
});
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: 500, translationKey: readableError.message, error });
  }
};


 
module.exports = { getTransactions };