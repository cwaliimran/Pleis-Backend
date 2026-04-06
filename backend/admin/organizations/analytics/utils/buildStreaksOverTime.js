const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildStreaksOverTime = (rows = []) => {
  const totalVisits = {};;

  // Iterate over rows to map totalAmount and totalOrders by month (_id)
  rows.forEach(r => {
    totalVisits[r._id] = Math.round(r.totalVisits || 0);  // Round totalAmount
  });

  // Return the result by mapping through the months
  return months.map((month, index) => ({
    month,
    totalVisits: totalVisits[index + 1] || 0  // Default to 0 if no data for the month
  }));
};

module.exports = { buildStreaksOverTime };