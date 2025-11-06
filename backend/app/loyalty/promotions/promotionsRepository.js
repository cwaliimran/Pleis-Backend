const {
  Promotion,
} = require("../../../commonModules/loyalty/promotions/models/Promotion");

// Get promotions with population
const getWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Promotion.find(query)
    .populate("menuItem")
    .populate("tierLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count
const count = async (query = {}) => {
  return Promotion.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return Promotion.findById(id)
    .populate("menuItem")
    .populate("tierLimit");
};

module.exports = {
  getWithFilters,
  count,
  findById,
};
