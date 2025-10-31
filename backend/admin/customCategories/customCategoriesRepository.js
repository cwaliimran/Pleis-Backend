// repositories/customCategoryRepository.js
const { getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const CustomCategories = require("./CustomCategories");

// Create
// Create customCategory and automatically assign next order
const createCustomCategory = async (data) => {
  // Find the highest current order (excluding deleted)
  const last = await CustomCategories.findOne({ status: { $ne: "deleted" } })
    .sort({ order: -1 })
    .select("order");

  const nextOrder = last ? last.order + 1 : 1;

  const customCategory = new CustomCategories({
    ...data,
    order: nextOrder,
  });

  return await customCategory.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getCustomCategoriesWithFilters = async (timezone, filter, skip, limit, sort = { order: 1 }) => {
  const now = getCurrentDateInTimezone({ timezone });

  const pipeline = [
    { $match: filter },
    { $sort: sort },
    ...(limit > 0 ? [{ $skip: skip }, { $limit: limit }] : []),

    // --- Lookup Users ---
    {
      $lookup: {
        from: "users",
        localField: "objects",
        foreignField: "_id",
        as: "userObjects",
        pipeline: [
          {
            $project: {
              _id: 1,
              profileIcon: 1,
              firstName: 1,
              lastName: 1,
            },
          },
        ],
      },
    },

    // --- Lookup Events (with organization populated) ---
    {
      $lookup: {
        from: "events",
        localField: "objects",
        foreignField: "_id",
        as: "eventObjects",
        pipeline: [
          {
            $match: {
              status: "active",
              "schedule.endDateTime": { $gte: now },
            },
          },
          {
            $lookup: {
              from: "organizations",
              localField: "basicInfo.organization",
              foreignField: "_id",
              as: "organizationInfo",
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    basicInfo: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              "basicInfo.organization": {
                $arrayElemAt: ["$organizationInfo", 0],
              },
            },
          },
          {
            $project: {
              _id: 1,
              basicInfo: 1,
            },
          },
        ],
      },
    },

    // --- Lookup Organizations ---
    {
      $lookup: {
        from: "organizations",
        localField: "objects",
        foreignField: "_id",
        as: "organizationObjects",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
              "basicInfo.media": 1,
            },
          },
        ],
      },
    },

    // --- Conditional merge of objects ---
    {
      $project: {
        _id: 1,
        title: 1,
        type: 1,
        status: 1,
        order: 1,
        createdAt: 1,
        updatedAt: 1,
        objects: {
          $switch: {
            branches: [
              { case: { $eq: ["$type", "User"] }, then: "$userObjects" },
              { case: { $eq: ["$type", "Event"] }, then: "$eventObjects" },
              { case: { $eq: ["$type", "Organizations"] }, then: "$organizationObjects" },
            ],
            default: [],
          },
        },
      },
    },
  ];

  const result = await CustomCategories.aggregate(pipeline);
  
  return result;
};



// Count by condition
const countCustomCategories = async (query = {}) => {
  return CustomCategories.countDocuments(query);
};



// Single efficient helper
const getCustomCategoriesCounts = async (filterQuery = {}) => {
  const [filteredCount, globalCounts] = await Promise.all([
    // count only filtered set (dynamic filters)
    CustomCategories.countDocuments(filterQuery),

    // facet for global status-based counts
    CustomCategories.aggregate([
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
const findCustomCategoryById = async (id) => {
  return CustomCategories.findById(id).populate('objects');
};

// Update and save
const updateCustomCategoryData = async (customCategory, data) => {
  Object.assign(customCategory, data);
  return await customCategory.save();
};

// Delete
const deleteCustomCategoryById = async (customCategory) => {
  return await customCategory.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return CustomCategories.findByIdAndUpdate(id, data, { new: true }).populate('objects');
};

// Reorder helper — bulk update many
const updateMany = async (filter, data) => {
  return CustomCategories.updateMany(filter, data);
};

// Optional: Normalize all order fields sequentially (1..n)
const normalizeOrders = async () => {
  const docs = await CustomCategories.find({ status: { $ne: "deleted" } }).sort("order");
  const ops = docs.map((doc, i) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: { order: i + 1 } },
    },
  }));
  if (ops.length) await CustomCategories.bulkWrite(ops);
  return true;
};

module.exports = {
  createCustomCategory,
  getCustomCategoriesWithFilters,
  countCustomCategories,
  getCustomCategoriesCounts,
  findCustomCategoryById,
  updateCustomCategoryData,
  deleteCustomCategoryById,
  findByIdAndUpdate,
  updateMany,
  normalizeOrders,
};