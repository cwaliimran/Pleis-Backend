const PinnedContent = require("./PinnedContent");

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

  return await pinnedContent.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getPinnedContentWithFilters = async (filter, skip, limit, sort = { order: 1 }) => {
  const query = PinnedContent.find(filter).sort(sort).populate('object');
  if (limit > 0) query.skip(skip).limit(limit);
  return query.exec();
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
  return PinnedContent.findById(id).populate('object');
};

// Update and save
const updatePinnedContentData = async (pinnedContent, data) => {
  Object.assign(pinnedContent, data);
  return await pinnedContent.save();
};

// Delete
const deletePinnedContentById = async (pinnedContent) => {
  return await pinnedContent.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return PinnedContent.findByIdAndUpdate(id, data, { new: true }).populate('object');
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return PinnedContent.updateMany(filter, data);
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