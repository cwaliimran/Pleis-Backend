const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildGlobalLoyaltySpendingOverTime = (rows = []) => {
  const map = {};

  rows.forEach(r => {
    map[r._id] = Math.round(r.values || 0);
  });

  return months.map((month, index) => ({
    month,
    values: map[index + 1] || 0
  }));
};

module.exports = { buildGlobalLoyaltySpendingOverTime };