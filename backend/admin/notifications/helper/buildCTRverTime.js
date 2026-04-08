const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const buildCTRverTime = (rawData = []) => {
  const map = {};
  
  // Map raw data into a key-value pair where the key is the month (1-12)
  rawData.forEach(r => {
    map[r.month] = r.CTR;
  });

  // Return the data for all months, with default 0 if missing
  return months.map((month, i) => ({
    month,
    CTR: map[i + 1] || 0,  // If no CTR for the month, default to 0
  }));
};

module.exports = { buildCTRverTime };