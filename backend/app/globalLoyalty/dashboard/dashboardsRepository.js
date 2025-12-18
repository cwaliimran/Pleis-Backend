
// Get dashboards with population
const getWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Dashboard.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count
const count = async (query = {}) => {
  return Dashboard.countDocuments(query);
};

module.exports = {
  getWithFilters,
  count,
};
