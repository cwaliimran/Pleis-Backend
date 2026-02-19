// repositories/highlightRepository.js

const { getCurrentDateInTimezone, getStartAndEndOfWeek, getStartAndEndOfDay } = require("../../helperUtils/responseUtil");
const mongoose = require("mongoose");
const { Highlights } = require("../../commonModules/highlights/Highlight");

const getPublicHighlightsWithFilters = async (
  userId,
  query,
  keyword,
  userLocation,
  radiusKm,
  skip,
  limit,
  category,
  time,
  timezone = "Asia/Karachi"
) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const now = getCurrentDateInTimezone({ timezone });

  const radiusInMeters = Math.max(radiusKm || 0, 0.1) * 1000;

  const geoMode =
    userLocation &&
    Array.isArray(userLocation.coordinates) &&
    userLocation.coordinates.length === 2 &&
    !(userLocation.coordinates[0] === 0 && userLocation.coordinates[1] === 0);

  /* ---------------- TIME FILTER (EVENTS) ---------------- */
  let eventTimeFilter = {};
  if (time && time !== "all") {
    let start, end;
    if (time === "live") {
      eventTimeFilter = {
        "schedule.startDateTime": { $lte: now },
        "schedule.endDateTime": { $gte: now }
      };
    } else if (time === "today") {
      ({ start, end } = getStartAndEndOfDay(now, timezone));
      eventTimeFilter = {
        "schedule.startDateTime": { $lte: end },
        "schedule.endDateTime": { $gte: start }
      };
    }
  }

  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },

    /* ---------------- EVENT LOOKUP ---------------- */
    {
      $lookup: {
        from: "events",
        let: { eventId: "$object" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$eventId"] } } },
          { $match: { status: "active", ...eventTimeFilter } },

          ...(geoMode
            ? [{
              $match: {
                "basicInfo.venueLocation": {
                  $geoWithin: {
                    $centerSphere: [
                      userLocation.coordinates,
                      radiusInMeters / 6378137
                    ]
                  }
                }
              }
            }]
            : []),

          /* ===============================
             👇 POPULATE ORGANIZATION HERE
          =============================== */
          {
            $lookup: {
              from: "organizations",
              localField: "basicInfo.organization",
              foreignField: "_id",
              pipeline: [
                { $match: { status: "active" } },
                {
                  $project: {
                    _id: 1,
                    basicInfo: 1
                  }
                }
              ],
              as: "organizationResolved"
            }
          },

          {
            $addFields: {
              "basicInfo.organization": {
                $arrayElemAt: ["$organizationResolved", 0]
              }
            }
          },

          {
            $project: {
              organizationResolved: 0
            }
          }
        ],
        as: "eventResolved"
      }
    },


    /* ---------------- ORGANIZATION LOOKUP ---------------- */
    {
      $lookup: {
        from: "organizations",
        let: { orgId: "$object" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$orgId"] } } },
          { $match: { status: "active" } },
          ...(geoMode
            ? [{
              $match: {
                location: {
                  $geoWithin: {
                    $centerSphere: [
                      userLocation.coordinates,
                      radiusInMeters / 6378137
                    ]
                  }
                }
              }
            }]
            : [])
        ],
        as: "orgResolved"
      }
    },

    /* ---------------- RESOLVE OBJECT ---------------- */
    {
      $addFields: {
        object: {
          $cond: [
            { $eq: ["$type", "event"] },
            { $arrayElemAt: ["$eventResolved", 0] },
            { $arrayElemAt: ["$orgResolved", 0] }
          ]
        }
      }
    },

    /* ---------------- DROP INVALID ---------------- */
    { $match: { object: { $ne: null } } },

    /* ---------------- FAVORITES LOOKUP ---------------- */
    {
      $lookup: {
        from: "favorites",
        let: {
          targetId: "$object._id",
          targetType: "$type"
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$targetId", "$$targetId"] },
                  { $eq: ["$targetType", "$$targetType"] },
                  { $eq: ["$user", userObjectId] }
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
        "object.isFavorite": {
          $gt: [{ $size: "$favoriteInfo" }, 0]
        }
      }
    },

    /* ---------------- FINAL SHAPE ---------------- */
    {
      $project: {
        type: 1,
        createdAt: 1,
        status: 1,
        meta: 1,
        title: 1,
        media: 1,
        object: 1
      }
    }
  ];

  return Highlights.aggregate(pipeline);
};

module.exports = {
  getPublicHighlightsWithFilters
};
