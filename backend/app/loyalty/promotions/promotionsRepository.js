const { default: mongoose } = require("mongoose");
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

const getPromotionsByCompanyOrganizer = async ({
  skip,
  limit,
  now,
  companyOrganizer,
}) => {
  const match = {
    status: "active",
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    endDate: { $gte: now }, // Only future OR running promotions
  };

  return Promotion.find(match)
    .populate({
      path: "companyOrganizer",
      select: "companyDetails.name firstName profileIcon",
    })
    .populate("menuItem")
    .populate("tierLimit")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit).lean().exec();
};


module.exports = {
  getWithFilters,
  count,
  findById,
  getPromotionsByCompanyOrganizer
};
