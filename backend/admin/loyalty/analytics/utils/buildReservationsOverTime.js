const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildByOverTime = (rows = []) => {
  const mapEarn = {};
  const mapRedeem = {};

  rows.forEach(r => {
    // Ensure the month is between 1 and 12
    const month = r._id;

    // Store earned points by month
    if (month >= 1 && month <= 12) {
      mapEarn[month] = Math.round(r.earn || 0);
      mapRedeem[month] = Math.round(r.redeem || 0);
    }
  });

  return months.map((month, index) => ({
    month,
    earn: mapEarn[index + 1] || 0,  // Map earned points for each month
    redeem: mapRedeem[index + 1] || 0 // Map redeemed points for each month
  }));
};

module.exports = { buildByOverTime };