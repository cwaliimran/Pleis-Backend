const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
const buildRevenueOverTime = (rows = []) => {
  // Initialize map with months, each having totalRevenue and netIncome set to 0
  const map = {};

  months.forEach((_, index) => {
    const monthKey = index + 1;
    map[monthKey] = {
      totalRevenue: 0,
      netIncome: 0,
    };
  });

  // Fill data from rows
  rows.forEach(r => {
    const { month, totalRevenue, netIncome } = r;

    if (!map[month]) map[month] = { totalRevenue: 0, netIncome: 0 };

    map[month].totalRevenue += totalRevenue || 0;
    map[month].netIncome += netIncome || 0;
  });

  // Convert to chart format
  return months.map((month, index) => {
    const monthIndex = index + 1;

    return {
      month,
      totalRevenue: map[monthIndex]?.totalRevenue || 0,
      netIncome: map[monthIndex]?.netIncome || 0,
    };
  });
};

module.exports = { buildRevenueOverTime };