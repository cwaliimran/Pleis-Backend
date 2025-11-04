
const { getWithFilters, getModelCounts, createWithAutoOrder } = require('@dbUtils/queryUtil');

const BannerControls = require("./BannerControls");

/**
 * Create new BannerControls (auto order)
 */
const createBannerControls = async (data) => createWithAutoOrder({ model: BannerControls, data, orderField: "order" });

/**
 * Fetch BannerControls with dynamic population depending on the `type` field.
 */

async function getBannerControlsWithFilters(filter, page = 1, limit = 10, sort = { order: 1 }) {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  return BannerControls.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
}


const getBannerControlsCounts = async (query) => {
  return getModelCounts({ model: BannerControls, filterQuery: query });
}


// Count by condition
const countBannerControls = async (query = {}) => {
  return BannerControls.countDocuments({ ...query });
};


// Find by ID
const findBannerControlsById = async (id) => {
  return BannerControls.findById(id).populate('objectModel');
};

// Update and save
const updateBannerControlsData = async (bannerControls, data) => {
  Object.assign(bannerControls, data);
  return await bannerControls.save();
};

// Delete
const deleteBannerControlsById = async (bannerControls) => {
  return await bannerControls.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return BannerControls.findByIdAndUpdate(id, data, { new: true }).populate('objectModel');
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return BannerControls.updateMany(filter, data);
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await BannerControls.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await BannerControls.bulkWrite(ops);
  return true;
};

module.exports = {
  createBannerControls,
  getBannerControlsWithFilters,
  countBannerControls,
  findBannerControlsById,
  updateBannerControlsData,
  deleteBannerControlsById,
  findByIdAndUpdate,
  updateMany,
  normalizeOrders,
  getBannerControlsCounts,
};