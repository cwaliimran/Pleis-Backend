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
  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;

  const radiusInMeters = Math.max(radiusKm || 0, 0.1) * 1000;

  // 🌍 GEO MODE (only if valid point)
  const geoMode =
    userLocation &&
    Array.isArray(userLocation.coordinates) &&
    userLocation.coordinates.length === 2;

  /* ----------------------------
     CATEGORY FILTERS
  ---------------------------- */
  const categoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};

  const categoryFilterOrganization = category
    ? { "otherInfo.categories": { $in: [catObjId] } }
    : {};

  /* ----------------------------
     TIME FILTER (EVENTS ONLY)
  ---------------------------- */
  let eventTimeFilter = {};

  if (time && time !== "all") {
    let start, end;

    switch (time) {
      case "live":
        eventTimeFilter = {
          "schedule.startDateTime": { $lte: now },
          "schedule.endDateTime": { $gte: now }
        };
        break;

      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        eventTimeFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start }
        };
        break;

      case "tomorrow":
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(tomorrow, timezone));
        eventTimeFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start }
        };
        break;

      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        eventTimeFilter = {
          "schedule.startDateTime": { $lte: end },
          "schedule.endDateTime": { $gte: start }
        };
        break;
    }
  }

  /* ----------------------------
     BASE PIPELINE
  ---------------------------- */
  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },

    /* ----------------------------
       EVENT LOOKUP
    ---------------------------- */
    {
      $lookup: {
        from: "events",
        let: { eventId: "$object" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$eventId"] } } },
          { $match: { status: "active", ...categoryFilter, ...eventTimeFilter } },

          // 🌍 Conditional GEO filter
          ...(geoMode
            ? [
                {
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
                }
              ]
            : []),

          {
            $lookup: {
              from: "organizations",
              localField: "basicInfo.organization",
              foreignField: "_id",
              as: "organizationInfo",
              pipeline: [
                { $project: { _id: 1, basicInfo: 1, location: 1 } }
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
                        { $eq: ["$user", userObjectId] },
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

          { $addFields: { isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] } } },

          {
            $project: {
              _id: 1,
              basicInfo: {
                media: "$basicInfo.media",
                title: "$basicInfo.title",
                description: "$basicInfo.description",
                organization: {
                  _id: "$basicInfo.organization._id",
                  basicInfo: {
                    media: "$basicInfo.organization.basicInfo.media",
                    name: "$basicInfo.organization.basicInfo.name"
                  },
                  location: "$basicInfo.organization.location"
                },
                venueLocation: "$basicInfo.venueLocation"
              },
              schedule: 1,
              isFavorite: 1
            }
          }
        ],
        as: "eventObjects"
      }
    },

    /* ----------------------------
       ORGANIZATION LOOKUP
    ---------------------------- */
    {
      $lookup: {
        from: "organizations",
        localField: "object",
        foreignField: "_id",
        as: "orgObject",
        pipeline: [
          { $match: { status: "active", ...categoryFilterOrganization } },

          ...(geoMode
            ? [
                {
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
                }
              ]
            : []),

          {
            $lookup: {
              from: "favorites",
              let: { orgId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$targetId", "$$orgId"] },
                        { $eq: ["$user", userObjectId] },
                        { $eq: ["$targetType", "organization"] }
                      ]
                    }
                  }
                },
                { $limit: 1 }
              ],
              as: "favoriteInfo"
            }
          },

          { $addFields: { isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] } } },

          {
            $project: {
              _id: 1,
              basicInfo: {
                media: "$basicInfo.media",
                name: "$basicInfo.name"
              },
              location: 1,
              isFavorite: 1
            }
          }
        ]
      }
    },

    {
      $addFields: {
        object: {
          $cond: [
            { $eq: ["$type", "event"] },
            { $arrayElemAt: ["$eventObjects", 0] },
            { $arrayElemAt: ["$orgObject", 0] }
          ]
        }
      }
    },

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
          { "object.basicInfo.socialLinks.youtube": regex }
        ]
      }
    });
  }

  return Highlights.aggregate(pipeline);
};



module.exports = {
  getPublicHighlightsWithFilters
};
