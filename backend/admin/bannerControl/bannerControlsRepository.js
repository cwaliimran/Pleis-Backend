const BannerControls = require("./BannerControls");

// Create
// Create bannerControls and automatically assign next order
const createBannerControls = async (data) => {
  // Find the highest current order (excluding deleted)
  const last = await BannerControls.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const bannerControls = new BannerControls({
    ...data,
    order: nextOrder,
  });

  return await bannerControls.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getBannerControlsWithFilters = async (filter, skip, limit, sort = { order: 1 }) => {
  const query = BannerControls.find(filter).sort(sort).populate('objectModel');
  if (limit > 0) query.skip(skip).limit(limit);
  return query.exec();
};

// Count by condition
const countBannerControls = async (query = {}) => {
  return BannerControls.countDocuments(query);
};

// Single efficient helper
const getBannerControlsCounts = async (filterQuery = {}) => {
  const [filteredCount, globalCounts] = await Promise.all([
    // count only filtered set (dynamic filters)
    BannerControls.countDocuments(filterQuery),

    // facet for global status-based counts
    BannerControls.aggregate([
      {
        $facet: {
          total: [
            { $match: { status: { $ne: "deleted" } } },
            { $count: "count" },
          ],
          active: [
            { $match: { status: "active" } },
            { $count: "count" },
          ],
          inactive: [
            { $match: { status: "inactive" } },
            { $count: "count" },
          ],
        },
      },
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
          active: { $ifNull: [{ $arrayElemAt: ["$active.count", 0] }, 0] },
          inactive: { $ifNull: [{ $arrayElemAt: ["$inactive.count", 0] }, 0] },
        },
      },
    ]),
  ]);

  const counts = globalCounts[0] || {};
  return {
    totalFiltered: filteredCount || 0,
    total: counts.total || 0,
    active: counts.active || 0,
    inactive: counts.inactive || 0,
  };
};

// Find by ID
const findBannerControlsById = async (id) => {
  return BannerControls.findById(id).populate('object');
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
  return BannerControls.findByIdAndUpdate(id, data, { new: true }).populate('object');
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
  getBannerControlsCounts,
  findBannerControlsById,
  updateBannerControlsData,
  deleteBannerControlsById,
  findByIdAndUpdate,
  updateMany,
  normalizeOrders,
};