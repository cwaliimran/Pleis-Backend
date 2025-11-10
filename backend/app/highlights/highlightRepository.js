// repositories/highlightRepository.js

const { getCurrentDateInTimezone, getStartAndEndOfWeek, getStartAndEndOfDay } = require("../../helperUtils/responseUtil");
const mongoose = require("mongoose");
const { Highlights } = require("../../commonModules/highlights/Highlight");

const getPublicHighlightsWithFilters = async (
  userId,
  query,
  keyword,
  skip,
  limit,
  category,
  time,
  timezone = "Asia/Karachi"
) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const now = getCurrentDateInTimezone({ timezone });
  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;

  const categoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};
  const categoryFilterOrganization = category
    ? { "otherInfo.categories": { $in: [catObjId] } }
    : {};

  // --- Time filter using utility pattern ---
  let eventTimeFilter = {};
  if (time && time !== "all") {
    let start, end;
    switch (time) {
      case "live":
        eventTimeFilter = { "schedule.startDateTime": { $lte: now }, "schedule.endDateTime": { $gte: now } };
        break;

      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        eventTimeFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      case "tomorrow":
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(tomorrow, timezone));
        eventTimeFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        eventTimeFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      default:
        eventTimeFilter = { "schedule.endDateTime": { $gte: now } };
    }
  } else {
    eventTimeFilter = { "schedule.endDateTime": { $gte: now } };
  }

  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },

    // --- Lookup Events with dynamic time filter + favorites + org ---
    {
      $lookup: {
        from: "events",
        localField: "object",
        foreignField: "_id",
        as: "eventObjects",
        pipeline: [
          {
            $match: {
              status: "active",
              ...categoryFilter,
              ...eventTimeFilter, // <-- applied here
            },
          },
          {
            $lookup: {
              from: "organizations",
              localField: "basicInfo.organization",
              foreignField: "_id",
              as: "organizationInfo",
              pipeline: [{ $project: { _id: 1, basicInfo: 1 } }],
            },
          },
          {
            $addFields: { "basicInfo.organization": { $arrayElemAt: ["$organizationInfo", 0] } },
          },
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
            $addFields: { isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] } },
          },
          { $project: { _id: 1, basicInfo: 1, schedule: 1, status: 1, isFavorite: 1 } },
        ],
      },
    },

    // --- Lookup Organizations ---
    {
      $lookup: {
        from: "organizations",
        localField: "object",
        foreignField: "_id",
        as: "orgObject",
        pipeline: [{ $match: { status: "active", ...categoryFilterOrganization } }],
      },
    },

    // --- Merge based on type ---
    {
      $addFields: {
        object: {
          $switch: {
            branches: [
              { case: { $eq: ["$type", "Event"] }, then: { $arrayElemAt: ["$eventObjects", 0] } },
              { case: { $eq: ["$type", "Organizations"] }, then: { $arrayElemAt: ["$orgObject", 0] } },
            ],
            default: null,
          },
        },
      },
    },
  ];

  // --- Keyword filter ---
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
