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
  console.log("sort--->", sort);
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
};