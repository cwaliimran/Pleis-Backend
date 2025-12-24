// repositories/popularEventRepository.js
const PopularEvents = require("./PopularEvents");

// Create top promo and automatically assign next order
const createPopularEvent = async (data) => {

  //skip if event already exists
  const existing = await PopularEvents.findOne({ event: data.event, status: { $ne: "deleted" } });

  if (existing) {
    throw new Error("popular_event_event_already_exists");
  }
  // Find the highest current order (excluding deleted)
  const last = await PopularEvents.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const popularEvent = new PopularEvents({
    ...data,
    order: nextOrder,
  });

  return await popularEvent.save();
};

// Get all with filters
const getPopularEventsWithFilters = async (query, skip, limit, sort = { order: 1 }) => {
  return PopularEvents.find(query)
    // .populate('event') // Populate the event reference
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countPopularEvents = async (query = {}) => {
  return PopularEvents.countDocuments(query);
};

// Single efficient helper
const getPopularEventsCounts = async (filterQuery = {}) => {
  const [filteredCount, globalCounts] = await Promise.all([
    // count only filtered set (dynamic filters)
    PopularEvents.countDocuments(filterQuery),

    // facet for global status-based counts
    PopularEvents.aggregate([
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
const findPopularEventById = async (id) => {
  return PopularEvents.findById(id).populate('event'); // Populate the event reference
};

// Update and save
const updatePopularEventData = async (popularEvent, data) => {
  Object.assign(popularEvent, data);
  return await popularEvent.save();
};

// Delete
const deletePopularEventById = async (popularEvent) => {
  return await popularEvent.deleteOne();
};

//findPopularEventByIdAndUpdate
const findPopularEventByIdAndUpdate = async (id, data) => {
  return PopularEvents.findByIdAndUpdate(id, data, { new: true }).populate('event'); // Populate the event reference
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return PopularEvents.updateMany(filter, data);
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await PopularEvents.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await PopularEvents.bulkWrite(ops);
  return true;
};

module.exports = {
  createPopularEvent,
  getPopularEventsWithFilters,
  countPopularEvents,
  findPopularEventById,
  updatePopularEventData,
  deletePopularEventById,
  findPopularEventByIdAndUpdate,
  updateMany,
  normalizeOrders,
  getPopularEventsCounts,
};