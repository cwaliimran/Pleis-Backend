const months = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

const buildReferralsOverTime = (rows = []) => {
  const map = {};

  rows.forEach(r => {
    map[r._id] = r.totalReferrals;
  });

  return months.map((month, index) => ({
    month,
    value: map[index + 1] || 0
  }));
};
module.exports = { buildReferralsOverTime };