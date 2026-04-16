const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildEventByOverTime = (rows = []) => {
  const mapAmount = {};
  const mapOrders = {};

  // Iterate over rows to map totalAmount and totalOrders by month (_id)
  rows.forEach(r => {
    mapAmount[r._id] = Math.round(r.totalAmount || 0);  // Round totalAmount
    mapOrders[r._id] = r.totalOrders || 0;  // Set totalOrders, defaulting to 0
  });

  // Return the result by mapping through the months
  return months.map((month, index) => ({
    month,
    revenue: mapAmount[index + 1] || 0,  // Default to 0 if no data for the month
    ticketesSold: mapOrders[index + 1] || 0  // Default to 0 if no data for the month
  }));
};

module.exports = { buildEventByOverTime };