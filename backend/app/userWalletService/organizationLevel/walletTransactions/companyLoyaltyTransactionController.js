const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage
} = require("@utils/responseUtil");

const companyService = require("./companyLoyaltyTransactionService");

const createCompanyTransaction = async (req, res) => {
  const {
    user,
    companyOrganizer,
    organization,
    type = "earn",
    points,
    description = "",
    objectType,
    objectId
  } = req.body;

  if (!validateParams(req, res, {
    rawData: ["user", "companyOrganizer", "type"],
    objectIdFields: ["user", "companyOrganizer", "organization"]
  })) return;

  if (!points || points.base === undefined || points.total === undefined) {
    return sendResponse({ res, statusCode: 400, translationKey: "invalid_points_payload" });
  }

  try {
    const tx = await companyService.createCompanyTransaction({
      user,
      companyOrganizer,
      organization,
      type,
      description,
      points,
      objectType,
      objectId
    });

    return sendResponse({ res, statusCode: 201, translationKey: "company_wallet_transaction_created", data: tx });
  } catch (e) {
    const err = getReadableErrorMessage(e);
    return sendResponse({ res, statusCode: err.statusCode, translationKey: err.message });
  }
};

const getCompanyTransactions = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { user, companyOrganizer, organization, type } = req.query;

  try {
    const { items, meta } = await companyService.getCompanyTransactions({
      page, limit, user, companyOrganizer, organization, type
    });

    return sendResponse({ res, statusCode: 200, translationKey: "company_wallet_transactions_fetched", data: items, meta });
  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: err.statusCode, translationKey: err.message });
  }
};

module.exports = {
  createCompanyTransaction,
  getCompanyTransactions,
  getCompanyTransactionDetails: async (req, res) => { },
  updateCompanyTransaction: async (req, res) => { },
  deleteCompanyTransaction: async (req, res) => { }
};
