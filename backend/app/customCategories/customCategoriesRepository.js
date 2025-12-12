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
  time
) => {
  const now = getCurrentDateInTimezone({ timezone });
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const catObjId = category ? new mongoose.Types.ObjectId(category) : null;

  const categoryFilter = category
    ? { "basicInfo.categories": { $in: [catObjId] } }
    : {};

  // --- Time filter ---
  let dateFilter = {};
  if (time && time !== "all") {
    let start, end;
    switch (time) {
      case "live":
        dateFilter = { "schedule.startDateTime": { $lte: now }, "schedule.endDateTime": { $gte: now } };
        break;

      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      case "tomorrow":
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(tomorrow, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;

      default:
        dateFilter = { "schedule.endDateTime": { $gte: now } };
    }
  } else {
    dateFilter = { "schedule.endDateTime": { $gte: now } };
  }

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

    // --- Lookup Events (with organization populated + favorites + time filter) ---
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
              ...categoryFilter,
              ...dateFilter, // <-- added time filter here
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
          {
            $project: { _id: 1, basicInfo: 1, schedule: 1, isFavorite: 1 },
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

  // --------------------------------------------------
  // 🎟️ BATCH FETCH MIN TICKET PRICE PER EVENT
  // --------------------------------------------------
  const results = Array.isArray(result) ? result : [];

  // extract only EVENT ids
  const eventIds = results
    .filter(cat => cat.type === "Event")
    .flatMap(cat => Array.isArray(cat.objects) ? cat.objects : [])
    .map(event => event._id)
    .filter(Boolean);

  // fetch prices once
  const ticketPriceMap =
    eventIds.length > 0
      ? await getMinTicketPricesByEventIds(eventIds)
      : {};

  // append ticketInfo ONLY to event objects
  results.forEach(category => {
    if (category.type !== "Event") return;

    if (!Array.isArray(category.objects)) return;

    category.objects.forEach(event => {
      const minPrice = ticketPriceMap[event._id.toString()] || null;

      event.ticketInfo = minPrice
        ? { price: `€${minPrice}` }
        : null;
    });
  });

  return results;
};




module.exports = {
  getCustomCategoriesWithFilters,
};