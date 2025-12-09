const mongoose = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");
const { Events } = require("../../../commonModules/events/Event");
const { formatEventResponse } = require("../formatter/eventFormatter");
const { getMinTicketPricesByEventIds } = require("../../ticketing/ticketingsRepository");

// TODO future events only
const getRecommendedEvents = async (eventId, options = {}) => {
  if (!eventId) return { data: [], meta: generateMeta(1, 10, 0) };

  const eventObjId = new mongoose.Types.ObjectId(eventId);
  const limit = parseInt(options.limit) || 10;
  const page = parseInt(options.page) || 1;
  const skip = (page - 1) * limit;
  const timezone = options.timezone || "UTC";

  // Step 1: Fetch base event info
  const baseEvent = await Events.findById(eventObjId)
    .select("basicInfo.organization basicInfo.venue basicInfo.categories basicInfo.tags status")
    .lean();

  if (!baseEvent) return { data: [], meta: generateMeta(page, limit, 0) };

  const organization = baseEvent.basicInfo?.organization || null;
  const venue = baseEvent.basicInfo?.venue || null;
  const categories = baseEvent.basicInfo?.categories || [];
  const tags = baseEvent.basicInfo?.tags || [];

  const weights = getEventSimilarityWeights(options);

  let results = [];

  // ---------------- Tier 1: Same organization ----------------
  results = await runEventSimilarityQuery({
    eventObjId,
    organization,
    venue,
    categories,
    tags,
    weights,
    limit,
    skip,
  });

  // ---------------- Tier 2: Other organizations ----------------
  if (results.length < limit) {
    const remaining = limit - results.length;
    const otherOrgResults = await runEventSimilarityQuery({
      eventObjId,
      organization: null,
      venue: null,
      categories,
      tags,
      weights,
      limit: remaining,
      skip: 0,
      excludeIds: results.map((r) => r._id),
    });
    results = [...results, ...otherOrgResults];
  }

  // ---------------- Tier 3: Trending fallback ----------------
  if (results.length < limit) {
    const remaining = limit - results.length;
    const trending = await Events.aggregate([
      {
        $match: {
          _id: { $ne: eventObjId },
          status: "active",
          "meta.viewsCount": { $gte: 0 },
        },
      },
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: ["$meta.viewsCount", 0.5] },
              { $multiply: ["$meta.favoritesCount", 1.5] },
              { $multiply: ["$meta.attendeesCount", 1.0] },
            ],
          },
        },
      },
      { $sort: { trendingScore: -1, createdAt: -1 } },
      { $limit: remaining },
      {
        $lookup: {
          from: "categories",
          localField: "basicInfo.categories",
          foreignField: "_id",
          as: "basicInfo.categories",
          pipeline: [{ $project: { _id: 1, title: 1, image: 1 } }],
        },
      },
      {
        $lookup: {
          from: "organizations",
          localField: "basicInfo.organization",
          foreignField: "_id",
          as: "basicInfo.organization",
          pipeline: [{ $project: { _id: 1, "basicInfo.name": 1, "basicInfo.media": 1 } }],
        },
      },
      { $unwind: { path: "$basicInfo.organization", preserveNullAndEmptyArrays: true } },
    ]);
    results = [...results, ...trending];
  }


  // ✅ Remove duplicates by _id
  results = results.filter(
    (event, index, self) =>
      index === self.findIndex((e) => e._id.toString() === event._id.toString())
  );

  // ✅ Use formatEventResponse for consistent formatting + timezone handling
  const formatted = results.map((event) =>
    formatEventResponse(event, { timezone })
  );

  // Fetch minimum ticket prices for all events in results
  const eventIds = results.map((e) => e._id);
  const ticketPriceMap = await getMinTicketPricesByEventIds(eventIds);

  // Attach minimum ticket price to each event
  formatted.forEach((event) => {
    const minPrice = ticketPriceMap[event._id.toString()] || null;
    event.ticketInfo = minPrice ? { price: `€${minPrice}` } : null;
  });

  const meta = generateMeta(page, limit, formatted.length);

  return {
    data: formatted,
    meta,
  };
};

/**
 * Shared aggregation logic for similarity search.
 */
async function runEventSimilarityQuery({
  eventObjId,
  organization,
  venue,
  categories,
  tags,
  weights,
  limit,
  skip = 0,
  excludeIds = [],
}) {
  const matchConditions = [
    { _id: { $ne: eventObjId, $nin: excludeIds } },
    { status: "active" },
  ];

  const orConditions = [];
  if (organization) orConditions.push({ "basicInfo.organization": organization });
  if (venue) orConditions.push({ "basicInfo.venue": venue });
  if (tags?.length) orConditions.push({ "basicInfo.tags": { $in: tags } });
  if (categories?.length) orConditions.push({ "basicInfo.categories": { $in: categories } });

  if (orConditions.length > 0) matchConditions.push({ $or: orConditions });

  return Events.aggregate([
    { $match: { $and: matchConditions } },
    {
      $addFields: {
        matchedTags: { $setIntersection: ["$basicInfo.tags", tags] },
        matchedCategories: { $setIntersection: ["$basicInfo.categories", categories] },
        sameOrganization: organization ? { $cond: [{ $eq: ["$basicInfo.organization", organization] }, 1, 0] } : 0,
        sameVenue: venue ? { $cond: [{ $eq: ["$basicInfo.venue", venue] }, 1, 0] } : 0,
      },
    },
    {
      $addFields: {
        similarityScore: {
          $add: [
            { $multiply: [{ $size: "$matchedTags" }, weights.tagWeight] },
            { $multiply: [{ $size: "$matchedCategories" }, weights.categoryWeight] },
            { $multiply: ["$sameOrganization", weights.organizationWeight] },
            { $multiply: ["$sameVenue", weights.venueWeight] },
          ],
        },
      },
    },
    { $match: { similarityScore: { $gt: 0 } } },
    { $sort: { similarityScore: -1, createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: "categories",
        localField: "basicInfo.categories",
        foreignField: "_id",
        as: "basicInfo.categories",
        pipeline: [{ $project: { _id: 1, title: 1, image: 1 } }],
      },
    },
    {
      $lookup: {
        from: "tags",
        localField: "basicInfo.tags",
        foreignField: "_id",
        as: "basicInfo.tags",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
      },
    },
    {
      $lookup: {
        from: "organizations",
        localField: "basicInfo.organization",
        foreignField: "_id",
        as: "basicInfo.organization",
        pipeline: [{ $project: { _id: 1, "basicInfo.name": 1, "basicInfo.media": 1 } }],
      },
    },
    { $unwind: { path: "$basicInfo.organization", preserveNullAndEmptyArrays: true } },
  ]);
}

/**
 * Adjustable weights for flexible tuning.
 */
function getEventSimilarityWeights(options = {}) {
  return {
    tagWeight: options.tagWeight ?? 1.0,
    categoryWeight: options.categoryWeight ?? 1.2,
    organizationWeight: options.organizationWeight ?? 2.0,
    venueWeight: options.venueWeight ?? 1.5,
  };
}

module.exports = {
  getRecommendedEvents,
};
