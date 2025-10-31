// repositories/topPromoRepository.js
const TopPromos = require("./TopPromos");

// Create top promo and automatically assign next order
const createTopPromo = async (data) => {

  //skip if event already exists
  const existing = await TopPromos.findOne({ event: data.event, status: { $ne: "deleted" } });

  if (existing) {
    throw new Error("top_promo_event_already_exists");
  }
  // Find the highest current order (excluding deleted)
  const last = await TopPromos.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const topPromo = new TopPromos({
    ...data,
    order: nextOrder,
  });

  return await topPromo.save();
};

// Get all with filters
const getTopPromosWithFilters = async (query, skip, limit, sort = { order: 1 }) => {
  return TopPromos.find(query)
    // .populate('event') // Populate the event reference
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countTopPromos = async (query = {}) => {
  return TopPromos.countDocuments(query);
};

// Single efficient helper
const getTopPromosCounts = async (filterQuery = {}) => {
  const [filteredCount, globalCounts] = await Promise.all([
    // count only filtered set (dynamic filters)
    TopPromos.countDocuments(filterQuery),

    // facet for global status-based counts
    TopPromos.aggregate([
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
const findTopPromoById = async (id) => {
  return TopPromos.findById(id).populate('event'); // Populate the event reference
};

// Update and save
const updateTopPromoData = async (topPromo, data) => {
  Object.assign(topPromo, data);
  return await topPromo.save();
};

// Delete
const deleteTopPromoById = async (topPromo) => {
  return await topPromo.deleteOne();
};

//findTopPromoByIdAndUpdate
const findTopPromoByIdAndUpdate = async (id, data) => {
  return TopPromos.findByIdAndUpdate(id, data, { new: true }).populate('event'); // Populate the event reference
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return TopPromos.updateMany(filter, data);
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await TopPromos.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await TopPromos.bulkWrite(ops);
  return true;
};

const getTop10Promos = async (filters = {}) => {
  const now = new Date();
  const topPromos = await TopPromos.find({ ...filters, isTop10: true })
    .populate({
      path: "event",
      select: "schedule basicInfo",
      match: {
        $or: [
          { "schedule.endDateTime": { $gte: now } },
          { "schedule.startDateTime": { $gte: now } },
        ],
        status: { $ne: "deleted" },
      },
      populate: {
        path: "basicInfo.organization",
        select: "basicInfo.media basicInfo.name",
      }
    });

  // remove promos whose event did not pass the populate match (event will be null)
  return topPromos.filter((p) => p.event);
};

module.exports = {
  createTopPromo,
  getTopPromosWithFilters,
  countTopPromos,
  findTopPromoById,
  updateTopPromoData,
  deleteTopPromoById,
  findTopPromoByIdAndUpdate,
  updateMany,
  normalizeOrders,
  getTopPromosCounts,
  getTop10Promos,
};