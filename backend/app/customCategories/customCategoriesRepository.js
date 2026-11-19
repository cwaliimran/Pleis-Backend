// repositories/customCategoryRepository.js
const CustomCategories = require("../../admin/customCategories/CustomCategories");
const { getCurrentDateInTimezone, getStartAndEndOfWeek, getStartAndEndOfDay } = require("../../helperUtils/responseUtil");


// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const mongoose = require("mongoose");
const { getMinTicketPricesByEventIds } = require("../ticketing/ticketingsRepository");

const getCustomCategoriesWithFilters = async (
  userId,
  timezone,
  filter,
  skip,
  limit,
  sort = { order: 1 },
  category,
  // Filter sheet on the "see all" screen; omitted by the home feed and admin.
  // { tagIds, venueTypeIds, geo: { coordinates: [lng, lat], radiusKm }, dateRange }
  objectFilters = null
) => {
  const now = getCurrentDateInTimezone({ timezone });
  const userObjectId = new mongoose.Types.ObjectId(userId);
  // One category id or several (all selected categories, any of them)
  const catObjIds = (Array.isArray(category) ? category : category ? [category] : [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const eventCategoryFilter = catObjIds.length
    ? { "basicInfo.categories": { $in: catObjIds } }
    : {};

  const organizationCategoryFilter = catObjIds.length
    ? { "otherInfo.categories": { $in: catObjIds } }
    : {};

  const of = objectFilters || {};
  const tagIds = of.tagIds || [];
  const venueTypeIds = of.venueTypeIds || [];
  const geoWithin = of.geo
    ? {
        $geoWithin: {
          $centerSphere: [of.geo.coordinates, of.geo.radiusKm / 6378.1],
        },
      }
    : null;

  // Every selected tag must be on the object; distance from the guest
  const organizationFilterSheet = {
    ...(tagIds.length ? { "otherInfo.tags": { $all: tagIds } } : {}),
    ...(geoWithin ? { location: geoWithin } : {}),
  };
  const eventFilterSheet = {
    ...(tagIds.length ? { "basicInfo.tags": { $all: tagIds } } : {}),
    ...(geoWithin ? { "basicInfo.venueLocation": geoWithin } : {}),
    ...(of.dateRange && Object.keys(of.dateRange).length
      ? { $and: [of.dateRange] }
      : {}),
  };

  const dateFilter = {
    "schedule.endDateTime": { $gte: now }
  };

  const pipeline = [
    { $match: filter },
    { $sort: sort },
    ...(limit > 0 ? [{ $skip: skip }, { $limit: limit }] : []),

    // USERS
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
              "companyDetails.logo": 1,
            }
          }
        ]
      }
    },

    // EVENTS
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
              ...eventCategoryFilter,
              ...dateFilter,
              ...eventFilterSheet
            }
          },
          {
            $lookup: {
              from: "organizations",
              localField: "basicInfo.organization",
              foreignField: "_id",
              as: "organizationInfo",
              pipeline: [{ $project: { _id: 1, basicInfo: 1 } }]
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

    // ORGANIZATIONS
    {
      $lookup: {
        from: "organizations",
        localField: "objects",
        foreignField: "_id",
        as: "organizationObjects",
        pipeline: [
          {
            $match: {
              status: "active",
              ...organizationCategoryFilter,
              ...organizationFilterSheet
            }
          },

          // PRIMARY VENUE → VENUE TYPE
          {
            $lookup: {
              from: "venues",
              let: { orgId: "$_id" },
              pipeline: [
                {
                  $match: {
                    $expr: { $eq: ["$organization", "$$orgId"] },
                    isPrimary: true,
                    status: "active"
                  }
                },
                {
                  $project: {
                    _id: 0,
                    venueType: 1
                  }
                }
              ],
              as: "primaryVenue"
            }
          },

          // Venue types picked in the filter sheet (primary venue)
          ...(venueTypeIds.length
            ? [{ $match: { "primaryVenue.venueType": { $in: venueTypeIds } } }]
            : []),

          // populate VenueTypes
          {
            $lookup: {
              from: "venuetypes",
              localField: "primaryVenue.venueType",
              foreignField: "_id",
              as: "venueTypes",
              pipeline: [
                { $project: { _id: 1, title: 1 } }
              ]
            }
          },

          // TAGS
          {
            $lookup: {
              from: "tags",
              localField: "otherInfo.tags",
              foreignField: "_id",
              as: "tags",
              pipeline: [{ $project: { _id: 1, title: 1 } }]
            }
          },

          // FINAL SHAPE FOR ORGANIZATION OBJECT
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
              "basicInfo.media": 1,
              operatingHours: 1,
              tags: 1,
              // Card address line: "street, City"
              location: 1,

              venue: {
                venueType: "$venueTypes"
              }
            }
          }
        ]
      }
    },

    // FINAL CATEGORY SHAPE
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
              { case: { $eq: ["$type", "Organizations"] }, then: "$organizationObjects" }
            ],
            default: []
          }
        }
      }
    }
  ];

  const result = await CustomCategories.aggregate(pipeline);

  // ticket prices for events
  const eventIds = result
    .filter(cat => cat.type === "Event")
    .flatMap(cat => Array.isArray(cat.objects) ? cat.objects : [])
    .map(evt => evt?._id)
    .filter(Boolean);

  const ticketPriceMap =
    eventIds.length > 0
      ? await getMinTicketPricesByEventIds(eventIds)
      : {};

  result.forEach(category => {
    if (category.type !== "Event") return;
    if (!Array.isArray(category.objects)) return;

    category.objects.forEach(event => {
      const minPrice = ticketPriceMap[event._id.toString()] || null;
      event.ticketInfo = minPrice ? { price: `€${minPrice}` } : null;
    });
  });

  return result;
};





module.exports = {
  getCustomCategoriesWithFilters,
};