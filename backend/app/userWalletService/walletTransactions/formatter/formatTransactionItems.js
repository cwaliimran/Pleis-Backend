/**
 * Format a wallet transaction document or plain object into API shape
 */
function formatTransactionItem(item) {
  if (!item) return null;
  const doc = typeof item.toObject === 'function' ? item.toObject() : { ...item };

  return {
    _id: doc._id,
    user: doc.user ? (doc.user._id ? { _id: doc.user._id, firstName: doc.user.firstName, lastName: doc.user.lastName, email: doc.user.email, profileIcon: doc.user.profileIcon } : doc.user) : null,
    wallet: doc.wallet,
    type: doc.type,
    source: doc.source,
    context: doc.context || {},
    points: doc.points || {},
    closingBalance: doc.closingBalance,
    description: doc.description,
    statusLevelAtTime: doc.statusLevelAtTime || null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = { formatTransactionItem };
