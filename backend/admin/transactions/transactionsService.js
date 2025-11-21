const { generateMeta } = require("@utils/responseUtil");
const transactionsRepo = require("./transactionsRepository");
const { formatTransaction } = require("./formatters/transactionsFormatter");


const getTransactionsService = async ({ page, limit, keyword, status, date, organizations, companyOrganizer }) => {
  const { transactions, meta } = await transactionsRepo.getTransactionsRepo({
    page,
    limit,
    keyword,
    status,
    organizations,
    companyOrganizer,
    date
  });

  // Format items
  const formatted = transactions.map(tx => formatTransaction(tx));

  return { transactions: formatted, meta };
};


module.exports = {
  getTransactionsService,
};