
const { getWithFilters, getModelCounts, createWithAutoOrder } = require('@dbUtils/queryUtil');
const { cache, invalidate } = require("@redisCache");

const BannerControls = require("./BannerControls");

/**
 * Create new BannerControls (auto order)
 */
const createBannerControls = async (data) => {
  const doc = await createWithAutoOrder({ model: BannerControls, data, orderField: "order" });
  await invalidate("banners");
  return doc;
};


/**
 * Fetch BannerControls with dynamic population depending on the `type` field.
 */
async function getBannerControlsWithFilters(
  filter,
  page = 1,
  limit = 10,
  sort = { order: 1 }
) {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  return BannerControls.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .select("description title image type object");
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

  const updated = await bannerControls.save();

  await invalidate("banners");

  return updated;
};


// Delete
const deleteBannerControlsById = async (bannerControls) => {
  const result = await bannerControls.deleteOne();

  await invalidate("banners");

  return result;
};


//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  const updated = await BannerControls.findByIdAndUpdate(id, data, { new: true }).populate("objectModel");

  await invalidate("banners");

  return updated;
};


// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  const res = await BannerControls.updateMany(filter, data);

  await invalidate("banners");

  return res;
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

  await invalidate("banners");

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