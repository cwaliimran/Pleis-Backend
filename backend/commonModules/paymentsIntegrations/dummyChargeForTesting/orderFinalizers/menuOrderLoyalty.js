const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");

/** Base spend earn rows for a menu order (excludes promotion-only earns). */
const hasMenuOrderBaseEarn = async (menuOrderId, session = null) => {
  let query = UnifiedWalletTransactions.findOne({
    entityId: menuOrderId,
    domainType: "menuorders",
    type: "earn",
  })
    .select("_id")
    .lean();

  if (session) {
    query = query.session(session);
  }

  const doc = await query;
  return Boolean(doc);
};

module.exports = { hasMenuOrderBaseEarn };
