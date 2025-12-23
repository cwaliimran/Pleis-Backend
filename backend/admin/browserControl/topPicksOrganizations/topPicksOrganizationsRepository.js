// repositories/topPicksOrganizationRepository.js
const TopPicksOrganizations = require("@TopPicksOrganizationsModel");

// Create top promo and automatically assign next order
const createTopPicksOrganization = async (data) => {

  //skip if organization already exists
  const existing = await TopPicksOrganizations.findOne({ organization: data.organization, status: { $ne: "deleted" } });

  if (existing) {
    throw new Error("top_picks_organization_already_exists");
  }
  // Find the highest current order (excluding deleted)
  const last = await TopPicksOrganizations.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const topPicksOrganization = new TopPicksOrganizations({
    ...data,
    order: nextOrder,
  });

  return await topPicksOrganization.save();
};

// Get all with filters
const getTopPicksOrganizationsWithFilters = async (query, skip, limit, sort = { order: 1 }) => {
  return TopPicksOrganizations.find(query)
    .populate('organization') // Populate the organization reference
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countTopPicksOrganizations = async (query = {}) => {
  return TopPicksOrganizations.countDocuments(query);
};

// Single efficient helper
const getTopPicksOrganizationsCounts = async (filterQuery = {}) => {
  const [filteredCount, globalCounts] = await Promise.all([
    // count only filtered set (dynamic filters)
    TopPicksOrganizations.countDocuments(filterQuery),

    // facet for global status-based counts
    TopPicksOrganizations.aggregate([
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
const findTopPicksOrganizationById = async (id) => {
  return TopPicksOrganizations.findById(id).populate('organization'); // Populate the organization reference
};

// Update and save
const updateTopPicksOrganizationData = async (topPicksOrganization, data) => {
  Object.assign(topPicksOrganization, data);
  return await topPicksOrganization.save();
};

// Delete
const deleteTopPicksOrganizationById = async (topPicksOrganization) => {
  return await topPicksOrganization.deleteOne();
};

//findTopPicksOrganizationByIdAndUpdate
const findTopPicksOrganizationByIdAndUpdate = async (id, data) => {
  return TopPicksOrganizations.findByIdAndUpdate(id, data, { new: true }).populate('organization'); // Populate the organization reference
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return TopPicksOrganizations.updateMany(filter, data);
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await TopPicksOrganizations.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await TopPicksOrganizations.bulkWrite(ops);
  return true;
};

module.exports = {
  createTopPicksOrganization,
  getTopPicksOrganizationsWithFilters,
  countTopPicksOrganizations,
  findTopPicksOrganizationById,
  updateTopPicksOrganizationData,
  deleteTopPicksOrganizationById,
  findTopPicksOrganizationByIdAndUpdate,
  updateMany,
  normalizeOrders,
  getTopPicksOrganizationsCounts,
};