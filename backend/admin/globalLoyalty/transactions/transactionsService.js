const { generateMeta } = require("@utils/responseUtil");
const transactionsRepo = require("./transactionsRepository");
const { formatTransaction } = require("./formatters/transactionsFormatter");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const  {GlobalWalletTransactions}  = require("@GlobalWalletTransactionsModel");









const getTransactionsService = async ({  page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const query = {};

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }
  // Get Transections with population
  const Transections = await transactionsRepo.getCGlobalWalletTransactionsWithFilters(query, skip, limit,keyword);
  
  const meta = generateMeta(page, limit);

  return { Transections, meta };
};





module.exports = {
  getTransactionsService,
};