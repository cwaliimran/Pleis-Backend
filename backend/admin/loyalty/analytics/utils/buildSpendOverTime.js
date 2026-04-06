const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildSpendOverTime = (rows = []) => {
  const value = {};

  rows.forEach(r => {
    // Ensure the month is between 1 and 12
    const month = r._id;

    // Store earned points by month
    if (month >= 1 && month <= 12) {
      value[month] = {
        totalAmount: Math.round(r.totalAmount || 0)
      };
    }
  });

  return months.map((month, index) => ({
    month,
    value: value[index + 1]?.totalAmount || 0,  // Map total amount for each month
  }));
};

module.exports = { buildSpendOverTime };