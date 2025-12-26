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
  category
) => {
  const now = getCurrentDateInTimezone({ timezone });
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;

  const eventCategoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};

  const organizationCategoryFilter = category
    ? { "otherInfo.categories": { $in: [catObjId] } }
    : {};

  const dateFilter = {
    "schedule.endDateTime": { $gte: now }
  };

  const pipeline = [
    { $match: filter },
    { $sort: sort },
    ...(limit > 0 ? [{ $skip: skip }, { $limit: limit }] : []),
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
              "companyDetails.loyaltySettings.title": 1
            }
          }
        ]
      }
    },
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
              ...dateFilter
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
          ...organizationCategoryFilter
        }
      },

      /* ===============================
         VENUE (PRIMARY ONLY)
         =============================== */
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
            { $project: { _id: 0, title: 1 } }
          ],
          as: "primaryVenue"
        }
      },

      /* ===============================
         TAGS (TITLE ONLY)
         =============================== */
      {
        $lookup: {
          from: "tags",
          localField: "otherInfo.tags",
          foreignField: "_id",
          as: "tags",
          pipeline: [{ $project: { _id: 1, title: 1 } }]
        }
      },

      /* ===============================
         PROJECT FINAL ORG SHAPE
         =============================== */
      {
        $project: {
          _id: 1,
          "basicInfo.name": 1,
          "basicInfo.media": 1,
          operatingHours: 1,

          venue: {
            title: { $ifNull: [{ $first: "$primaryVenue.title" }, null] }
          },

          tags: 1
        }
      }
    ]
  }
}
,
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