const TopPromos = require("../../admin/browserControl/top10PromoSection/TopPromos");
const { getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const getTop10Promos = async (userId, timezone) => {
  const now = getCurrentDateInTimezone({ timezone });

  const topPromos = await TopPromos.aggregate([
    {
      $match: {
        status: "active",
        isTop10: true
      }
    },
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
              $or: [
                { "schedule.endDateTime": { $gte: now } },
                { "schedule.startDateTime": { $gte: now } }
              ]
            }
          },
          {
            $lookup: {
              from: "organizations",
              localField: "basicInfo.organization",
              foreignField: "_id",
              as: "organizationInfo",
              pipeline: [
                { $project: { _id: 1, basicInfo: 1 } }
              ]
            }
          },
          {
            $addFields: {
              "basicInfo.organization": {
                $arrayElemAt: ["$organizationInfo", 0]
              }
            }
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
                        { $eq: ["$user", userId] },
                        { $eq: ["$targetType", "event"] }
                      ]
                    }
                  }
                },
                { $limit: 1 }
              ],
              as: "favoriteInfo"
            }
          },
          {
            $addFields: {
              isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] }
            }
          },
          {
            $project: {
              _id: 1,
              basicInfo: 1,
              schedule: 1,
              isFavorite: 1
            }
          }
        ]
      }
    },
    { $unwind: "$event" }
  ]);

  return topPromos;
};

module.exports = {
  getTop10Promos,
};