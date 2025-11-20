// repositories/statusBadgeRepository.js
const { getModelCounts } = require("../../helperUtils/dbUtils/queryUtil");
const StatusBadges = require("./StatusBadges");

// Create statusBadge and automatically assign next order
const createStatusBadge = async (data) => {
  // Find the highest current order (excluding deleted)
  const last = await StatusBadges.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const statusBadge = new StatusBadges({
    ...data,
    order: nextOrder,
  });

  return await statusBadge.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getStatusBadgesWithFilters = async (
  filter,
  skip,
  limit,
  sort = { order: 1 },
  selectFields = null
) => {
  const query = StatusBadges.find(filter).sort(sort);

  if (selectFields) query.select(selectFields); // apply select dynamically
  if (limit > 0) query.skip(skip).limit(limit);

  return query.exec();
};

// Count by condition
const countStatusBadges = async (query = {}) => {
  return StatusBadges.countDocuments(query);
};

const getRecordsCountByStatus = async (query) => {
  return getModelCounts({ model: StatusBadges, filterQuery: query });
}

// Find by ID
const findStatusBadgeById = async (id) => {
  return StatusBadges.findById(id);
};

// Update and save
const updateStatusBadgeData = async (statusBadge, data) => {
  Object.assign(statusBadge, data);
  return await statusBadge.save();
};

// Delete
const deleteStatusBadgeById = async (statusBadge) => {
  return await statusBadge.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return StatusBadges.findByIdAndUpdate(id, data, { new: true });
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return StatusBadges.updateMany(filter, data);
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await StatusBadges.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await StatusBadges.bulkWrite(ops);
  return true;
};

module.exports = {
  createStatusBadge,
  getStatusBadgesWithFilters,
  countStatusBadges,
  findStatusBadgeById,
  updateStatusBadgeData,
  deleteStatusBadgeById,
  findByIdAndUpdate,
  updateMany,
  normalizeOrders,
  getRecordsCountByStatus,
};