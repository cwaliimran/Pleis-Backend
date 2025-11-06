// repositories/customCategoryRepository.js
const CustomCategories = require("../../admin/customCategories/CustomCategories");
const { getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");


// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const mongoose = require("mongoose");

const getCustomCategoriesWithFilters = async (userId, timezone, filter, skip, limit, sort = { order: 1 }) => {
  const now = getCurrentDateInTimezone({ timezone });
  const userObjectId = new mongoose.Types.ObjectId(userId);

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
              profileIcon: 1,
              firstName: 1,
              lastName: 1,
              "companyDetails.loyaltySettings.title": 1,
            },
          },
        ],
      },
    },

    // --- Lookup Events (with organization populated + favorites) ---
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
                { $project: { _id: 1, basicInfo: 1 } },
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

          // --- Add Favorites Lookup ---
          {
            $lookup: {
              from: "favorites",
              let: { eventId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$targetId", "$$eventId"] },
                        { $eq: ["$user", userObjectId] },
                        { $eq: ["$targetType", "event"] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
              ],
              as: "favoriteInfo",
            },
          },
          {
            $addFields: {
              isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] },
            },
          },

          {
            $project: {
              _id: 1,
              basicInfo: 1,
              schedule: 1,
              isFavorite: 1,
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



module.exports = {
  getCustomCategoriesWithFilters,
};