const PinnedContent = require("./PinnedContent");
const { cache, invalidate } = require("@redisCache");

// Create
// Create pinnedContent and automatically assign next order
const createPinnedContent = async (data) => {
  // Find the highest current order (excluding deleted)
  const last = await PinnedContent.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const pinnedContent = new PinnedContent({
    ...data,
    order: nextOrder,
  });

  const saved = await pinnedContent.save();
  await invalidate("pinnedContent");
  return saved;
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getPinnedContentWithFilters = async (filter, sort = { order: 1 }) => {
  return cache({
    namespace: "pinnedContent:list",
    params: { filter: JSON.stringify(filter), sort: JSON.stringify(sort) },
    ttl: 3600, // 1 hour
    fetchFn: () =>
      PinnedContent.find(filter).sort(sort).populate({ path: "filter" }).exec(),
  });
};

// Count by condition
const countPinnedContent = async (query = {}) => {
  return PinnedContent.countDocuments(query);
};

// Single efficient helper
const getPinnedContentCounts = async (filterQuery = {}) => {
  const [filteredCount, globalCounts] = await Promise.all([
    // count only filtered set (dynamic filters)
    PinnedContent.countDocuments(filterQuery),

    // facet for global status-based counts
    PinnedContent.aggregate([
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
const findPinnedContentById = async (id) => {
  return PinnedContent.findById(id).populate('filter');
};

// Update and save
const updatePinnedContentData = async (pinnedContent, data) => {
  Object.assign(pinnedContent, data);
  const updated = await pinnedContent.save();
  await invalidate("pinnedContent");
  return updated;
};

// Delete
const deletePinnedContentById = async (pinnedContent) => {
  const result = await pinnedContent.deleteOne();
  await invalidate("pinnedContent");
  return result;
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  const updated = await PinnedContent.findByIdAndUpdate(id, data, { new: true }).populate('filter');
  await invalidate("pinnedContent");
  return updated;
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  const result = await PinnedContent.updateMany(filter, data);
  await invalidate("pinnedContent");
  return result;
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await PinnedContent.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await PinnedContent.bulkWrite(ops);
  await invalidate("pinnedContent");
  return true;
};

module.exports = {
  createPinnedContent,
  getPinnedContentWithFilters,
  countPinnedContent,
  getPinnedContentCounts,
  findPinnedContentById,
  updatePinnedContentData,
  deletePinnedContentById,
  findByIdAndUpdate,
  updateMany,
  normalizeOrders,
};