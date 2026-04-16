const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
const buildGlobalLoyaltySpendingByGender = (data = []) => {
  const monthlyStats = {};

  for (const month of months) {
    monthlyStats[month] = {
      month,
      male: 0,
      female: 0,
      other: 0,
    };
  }
  for (const item of data) {
    const monthName = months[item.month - 1];
    const gender = (item.gender || "").toLowerCase();
    const value = Math.round(item.values || 0);

    if (!monthName || !monthlyStats[monthName]) continue;

    if (gender === "male") {
      monthlyStats[monthName].male += value;
    } else if (gender === "female") {
      monthlyStats[monthName].female += value;
    } else {
      monthlyStats[monthName].other += value;
    }
  }

  return Object.values(monthlyStats);
};

module.exports = {
  buildGlobalLoyaltySpendingByGender,
};