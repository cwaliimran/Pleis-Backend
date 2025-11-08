const {
  Promotion,
  BuyMenuItemPromotion,
  HappyHourPromotion,
  ProductSalePromotion,
} = require("./models/Promotion");
const mongoose = require("mongoose");

// Decide which discriminator model to use
const getModelByTaskType = (taskType) => {
  switch (taskType) {

    case "buyMenuItem":
      return BuyMenuItemPromotion;
    case "happyHour":
      return HappyHourPromotion;
    case "productSale":
      return ProductSalePromotion;
    default:
      return Promotion; // fallback
  }
};

// Create promotion
const create = async (data) => {
  try {
    const Model = getModelByTaskType(data.taskType);
    const item = new Model(data);
    const saved = await item.save();
    return saved.toObject(); // Removes Mongoose internals
  } catch (err) {
    throw err;
  }
};

// Get promotions with population
const getWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return Promotion.find(query)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit).lean().exec();
};

// Count
const count = async (query = {}) => {
  return Promotion.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return Promotion.findById(id)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" }).exec();
};

// Update and save
const updateData = async (item, data) => {
  Object.assign(item, data);
  return await item.save();
};

// Delete
const deleteItem = async (item) => {
  return await item.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Promotion.findByIdAndUpdate(id, data, { new: true })
    .populate("menuItem")
    .populate("tierLimit");
};

module.exports = {
  create,
  getWithFilters,
  count,
  findById,
  updateData,
  deleteItem,
  findByIdAndUpdate,
};
