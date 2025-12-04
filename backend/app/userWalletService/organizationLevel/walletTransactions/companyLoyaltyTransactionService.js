const { generateMeta } = require("../../../../helperUtils/responseUtil");
const companyRepo = require("./companyLoyaltyTransactionRepository");
const { formatTransactionItem } = require("./formatter/formatTransactionItems");

//create company loyalty transaction
//it also logs for global wallet transactions
const createCompanyTransaction = async (data) => {
  const doc = await companyRepo.createCompanyTransaction(data);
  return formatTransactionItem(doc);
};

const getCompanyTransactions = async ({ page, limit, user, companyOrganizer, organization, type }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const query = {};
  if (user) query.user = user;
  if (companyOrganizer) query.companyOrganizer = companyOrganizer;
  if (organization) query.organization = organization;
  if (type) query.type = type;

  const [items, total] = await Promise.all([
    companyRepo.getCompanyTransactionsWithFilters(query, skip, limit),
    companyRepo.countCompanyTransactions(query)
  ]);

  let meta = generateMeta(page, limit, total);
  return { items: items.map(formatTransactionItem), meta };
};

module.exports = {
  createCompanyTransaction,
  getCompanyTransactions,
};
