// repositories/highlightRepository.js


const mongoose = require("mongoose");
const { Highlights } = require("../../commonModules/highlights/Highlight");

const getPublicHighlightsWithFilters = async (userId, query, keyword, skip, limit) => {
  const now = new Date();
const userObjectId = new mongoose.Types.ObjectId(userId);

  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },

    // --- Lookup from Events (with organization + favorites) ---
    {
      $lookup: {
        from: "events",
        localField: "object",
        foreignField: "_id",
        as: "eventObject",
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
                    "basicInfo.media.logo": 1,
                    "basicInfo.name": 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              "basicInfo.organization": { $arrayElemAt: ["$organizationInfo", 0] },
            },
          },

          // --- Lookup user favorites ---
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
              status: 1,
              isFavorite: 1,
            },
          },
        ],
      },
    },

    // --- Lookup from Organizations (direct highlight reference) ---
    {
      $lookup: {
        from: "organizations",
        localField: "object",
        foreignField: "_id",
        as: "orgObject",
      },
    },

    // --- Merge correct object based on highlight type ---
    {
      $addFields: {
        object: {
          $cond: [
            { $eq: ["$type", "event"] },
            { $arrayElemAt: ["$eventObject", 0] },
            { $arrayElemAt: ["$orgObject", 0] },
          ],
        },
      },
    },
  ];

  // --- Keyword filter after lookups ---
  if (keyword) {
    const regex = { $regex: keyword, $options: "i" };

    pipeline.push({
      $match: {
        $or: [
          { title: regex },
          { "media.name": regex },
          { "object.basicInfo.title": regex },
          { "object.basicInfo.name": regex },
          { "object.basicInfo.description": regex },
          { "object.basicInfo.organization.basicInfo.name": regex },
          { "object.basicInfo.socialLinks.facebook": regex },
          { "object.basicInfo.socialLinks.instagram": regex },
          { "object.basicInfo.socialLinks.linkedin": regex },
          { "object.basicInfo.socialLinks.youtube": regex },
        ],
      },
    });
  }

  // --- Final projection ---
  pipeline.push({
    $project: {
      type: 1,
      createdAt: 1,
      meta: 1,
      status: 1,
      title: 1,
      media: 1,

      // object fields
      "object._id": 1,
      "object.basicInfo.title": 1,
      "object.basicInfo.name": 1,
      "object.basicInfo.venueLocation": 1,
      "object.basicInfo.media": 1,
      "object.basicInfo.description": 1,
      "object.basicInfo.organization.basicInfo.name": 1,
      "object.basicInfo.organization.basicInfo.media": 1,
      "object.schedule": 1,
      "object.isFavorite": 1,
    },
  });

  return Highlights.aggregate(pipeline);
};

module.exports = {
   getPublicHighlightsWithFilters,

};
