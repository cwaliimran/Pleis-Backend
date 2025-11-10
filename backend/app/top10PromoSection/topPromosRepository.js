const { default: mongoose } = require("mongoose");
const TopPromos = require("../../admin/browserControl/top10PromoSection/TopPromos");
const { getCurrentDateInTimezone, getStartAndEndOfDay, getStartAndEndOfWeek } = require("../../helperUtils/responseUtil");

const getTop10Promos = async (userId, timezone, category, time) => {
  // 🕐 Base time reference
  const now = getCurrentDateInTimezone({ timezone });

  // 🗓️ Calculate start/end based on "time"
  let dateFilter = {};
  if (time && time !== "all") {
    let start, end;

    switch (time) {
      case "live":
        // Events happening now
        dateFilter = {
          "schedule.startDateTime": { $lte: now },
          "schedule.endDateTime": { $gte: now },
        };
        break;

      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        dateFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start },
        };
        break;

      case "tomorrow":
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(tomorrow, timezone));
        dateFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start },
        };
        break;

      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        dateFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start },
        };
        break;

      default:
        // fallback to active events from now onwards
        dateFilter = {
          $or: [
            { "schedule.endDateTime": { $gte: now } },
            { "schedule.startDateTime": { $gte: now } },
          ],
        };
    }
  } else {
    // "all" case → show only active and upcoming
    dateFilter = {
      $or: [
        { "schedule.endDateTime": { $gte: now } },
        { "schedule.startDateTime": { $gte: now } },
      ],
    };
  }

  // 🎯 Category filter
  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;
  const categoryFilter = category
    ? {
        "basicInfo.categories": { $in: [catObjId] },
      }
    : {};

  // 🧩 Aggregation pipeline
  const topPromos = await TopPromos.aggregate([
    { $match: { status: "active", isTop10: true } },
    {
      $lookup: {
        from: "events",
        localField: "event",
        foreignField: "_id",
        as: "event",
        pipeline: [
          {
            $match: {
              status: { $ne: "deleted" },
              ...dateFilter,
              ...categoryFilter,
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
            $addFields: {
              "basicInfo.organization": { $arrayElemAt: ["$organizationInfo", 0] },
            },
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
                        { $eq: ["$user", new mongoose.Types.ObjectId(userId)] },
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
    { $unwind: "$event" },
  ]);

  return topPromos;
};


module.exports = {
  getTop10Promos,
};