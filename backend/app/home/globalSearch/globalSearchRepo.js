const Organizations = require("@OrganizationModel");
const Tags = require("@TagsModel");

const { generateMeta } = require("@utils/responseUtil");
const { getNearbyEventsWithAdvanceFilters } = require("../../events/eventService");
const mongoose = require("mongoose");

//
// EVENTS
//
async function searchEvents(ctx) {
  const { events, meta } = await getNearbyEventsWithAdvanceFilters(ctx);
  return { data: events, meta };
}

//
// ORGANIZATIONS
//
async function searchOrganizations(ctx) {
  const {
    keyword,
    page,
    limit,
    latitude,
    longitude,
    sort, //asc/desc
    advanceFilters = {},
  } = ctx;

  const {
    categories = [],
    tags = [],
    venueTypes = [],
    genre = [],
    distanceFrom = 0,
    distanceTo = 0,    // 0 = no max radius
  } = advanceFilters;

  const skip = (page - 1) * limit;

  // base org filter
  const filter = { status: "active" };

  const toObjectIds = (arr) =>
    arr
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

  const categoryObjectIds = toObjectIds(categories);
  const tagObjectIds = toObjectIds(tags);
  const venueTypeObjectIds = toObjectIds(venueTypes);

  // ------------------------------------
  //  TEXT SEARCH
  // ------------------------------------
  if (keyword)
    filter["basicInfo.name"] = { $regex: keyword, $options: "i" };

  // ------------------------------------
  //  CATEGORY FILTER
  // ------------------------------------
  if (categoryObjectIds.length)
    filter["otherInfo.categories"] = { $in: categoryObjectIds };

  // ------------------------------------
  //  TAG FILTER (by _id)
  // ------------------------------------
  if (tagObjectIds.length)
    filter["otherInfo.tags"] = { $in: tagObjectIds };

  // ------------------------------------
  //  GENRE FILTER (Tag.type -> Tag._id)
  // ------------------------------------
  let genreTagIds = [];

  if (genre.length) {
    const genreTags = await Tags.find({
      status: "active",
      type: { $in: genre },
    }).select("_id");

    genreTagIds = genreTags.map((t) => t._id);

    // Genre was passed, but nothing matched → force NO results
    if (genre.length && !genreTagIds.length) {
      filter["otherInfo.tags"] = { $in: [] };
    }

    // Normal case: apply genre filter
    if (genreTagIds.length) {
      filter["otherInfo.tags"] = { $in: genreTagIds };
    }

  }

  const distanceToMeters = distanceTo * 1000;
  const distanceFromMeters = distanceFrom * 1000;

  // ------------------------------------
  //  GEO STAGE
  // ------------------------------------
  const geoStage =
    latitude && longitude
      ? [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [longitude, latitude] },
            key: "location",
            distanceField: "distance",
            spherical: true,
            query: filter,
            ...(distanceTo > 0 ? { maxDistance: distanceToMeters } : {}),
          },
        },
        ...(distanceFrom > 0
          ? [{ $match: { distance: { $gte: distanceFromMeters } } }]
          : []),
      ]
      : [{ $match: filter }];

  // ------------------------------------
  //  MAIN PIPELINE
  // ------------------------------------
  const pipeline = [
    ...geoStage,

    // attach primary venue
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$organization", "$$orgId"] },
              status: "active",
              isPrimary: true,
              ...(venueTypeObjectIds.length
                ? { venueType: { $in: venueTypeObjectIds } }
                : {}),
            },
          },
          { $project: { _id: 1, title: 1, venueType: 1 } },
        ],
        as: "primaryVenue",
      },
    },

    // ensure venueTypes match if filter applied
    ...(venueTypeObjectIds.length
      ? [{ $match: { primaryVenue: { $ne: [] } } }]
      : []),

    // sort createdAt asc/desc
    {
      $sort: {
        createdAt: sort === "asc" ? 1 : -1,
      },
    },
    { $skip: skip },
    { $limit: limit },
  ];

  // ------------------------------------
  //  COUNT PIPELINE
  // ------------------------------------
  const countPipeline = [
    ...geoStage,
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$organization", "$$orgId"] },
              status: "active",
              isPrimary: true,
              ...(venueTypeObjectIds.length
                ? { venueType: { $in: venueTypeObjectIds } }
                : {}),
            },
          },
        ],
        as: "primaryVenue",
      },
    },
    ...(venueTypeObjectIds.length
      ? [{ $match: { primaryVenue: { $ne: [] } } }]
      : []),
    { $count: "total" },
  ];

  const [items, totalAgg] = await Promise.all([
    Organizations.aggregate(pipeline),
    Organizations.aggregate(countPipeline),
  ]);

  const totalCount = totalAgg?.[0]?.total || 0;

  return {
    data: items,
    meta: generateMeta(page, limit, totalCount),
  };
}



module.exports = {
  searchEvents,
  searchOrganizations,
};
