/**
 * Fast map-marker queries for viewport bounds.
 * Skips category/tag populates, full org formatting, and duplicate count aggregations.
 * Response stays pin-friendly: id, location, title, logo — enough for clusters + markers.
 */
const mongoose = require("mongoose");
const Organizations = require("../../commonModules/organizations/Organization");
const { Events } = require("../../commonModules/events/Event");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const { cache } = require("@redisCache");
const { getFullImageUrl } = require("@utils/imageHelper");
const {
  getVenueTypeObjectIdsForMainCategories,
} = require("../../admin/venueTypes/resolveCategoryVenueTypes");
const Tags = require("@TagsModel");
const { getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");

/** Quantize bounds so tiny pans share one cache key (~110m at 3 decimals). */
function quantizeBounds(bounds) {
  if (!bounds?.northEast || !bounds?.southWest) return "none";
  const q = (n) => Number(n).toFixed(3);
  return [
    q(bounds.southWest.latitude),
    q(bounds.southWest.longitude),
    q(bounds.northEast.latitude),
    q(bounds.northEast.longitude),
  ].join(",");
}

function filtersFingerprint(advanceFilters = {}, keyword = "") {
  const af = advanceFilters || {};
  const norm = (arr) =>
    [...(arr || [])].map(String).filter(Boolean).sort().join(",");
  return [
    `kw=${String(keyword || "").trim().toLowerCase()}`,
    `t=${af.time || ""}`,
    `c=${norm(af.categories)}`,
    `v=${norm(af.venueTypes)}`,
    `g=${norm(af.genre)}`,
    `tg=${norm(af.tags)}`,
  ].join("&");
}

async function resolveMapVenueTypeIds(advanceFilters = {}) {
  const explicit = (advanceFilters.venueTypes || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (explicit.length) return explicit;

  const cats = (advanceFilters.categories || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (!cats.length) return [];
  return getVenueTypeObjectIdsForMainCategories(cats);
}

function formatPlaceMarker(doc, favSet) {
  const markerRaw = doc?.basicInfo?.media?.logoMarker;
  const logoRaw = doc?.basicInfo?.media?.logo;
  const markerName =
    typeof markerRaw === "string" && markerRaw.trim()
      ? markerRaw.trim()
      : null;
  const logoName =
    typeof logoRaw === "string" && logoRaw.trim()
      ? logoRaw.trim()
      : logoRaw?.name || null;
  const pin = markerName || logoName;
  return {
    _id: doc._id,
    type: "place",
    location: doc.location,
    basicInfo: {
      name: doc?.basicInfo?.name || "",
      media: {
        logo: pin ? getFullImageUrl(pin) : null,
      },
    },
    isFavorite: favSet ? favSet.has(String(doc._id)) : false,
  };
}

function formatEventMarker(doc, favSet) {
  const media = doc?.basicInfo?.media || {};
  const markerName =
    typeof media.marker === "string" && media.marker.trim()
      ? media.marker.trim()
      : null;
  // Events store image(s) in media.name — prefer generated marker, else first image
  let firstImage = null;
  if (typeof media.name === "string" && media.name.trim()) {
    firstImage = media.name.split(/[,|]/)[0].trim() || null;
  }
  const pin = markerName || firstImage;
  const coords = doc?.basicInfo?.venueLocation?.coordinates;
  return {
    _id: doc._id,
    type: "event",
    location: coords
      ? { type: "Point", coordinates: coords }
      : doc?.basicInfo?.venueLocation || null,
    basicInfo: {
      title: doc?.basicInfo?.title || "",
      media: {
        logo: pin ? getFullImageUrl(pin) : null,
      },
      organization: doc?.basicInfo?.organization || null,
    },
    schedule: doc.schedule
      ? {
          startDateTime: doc.schedule.startDateTime,
          endDateTime: doc.schedule.endDateTime,
        }
      : null,
    isFavorite: favSet ? favSet.has(String(doc._id)) : false,
  };
}

async function fetchLeanPlaces({
  bounds,
  keyword = "",
  advanceFilters = {},
  userId = null,
}) {
  const matchFilter = { status: "active" };

  if (keyword?.trim()) {
    matchFilter["basicInfo.name"] = { $regex: keyword.trim(), $options: "i" };
  }

  const tagObjIds = (advanceFilters.tags || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (tagObjIds.length) {
    matchFilter["otherInfo.tags"] = { $in: tagObjIds };
  }

  if ((advanceFilters.genre || []).length) {
    const genreTags = await Tags.find({
      status: "active",
      type: { $in: advanceFilters.genre },
    })
      .select("_id")
      .lean();
    matchFilter["otherInfo.tags"] = {
      $in: genreTags.map((t) => t._id),
    };
  }

  if (bounds?.northEast && bounds?.southWest) {
    matchFilter.location = {
      $geoWithin: {
        $box: [
          [bounds.southWest.longitude, bounds.southWest.latitude],
          [bounds.northEast.longitude, bounds.northEast.latitude],
        ],
      },
    };
  }

  const venueTypeObjIds = await resolveMapVenueTypeIds(advanceFilters);
  // Main category with zero linked venue types → empty map
  if (
    (advanceFilters.categories || []).length &&
    !(advanceFilters.venueTypes || []).length &&
    !venueTypeObjIds.length
  ) {
    return [];
  }

  const pipeline = [
    { $match: matchFilter },
    ...(venueTypeObjIds.length
      ? [
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
                    venueType: { $in: venueTypeObjIds },
                  },
                },
                { $project: { _id: 1 } },
                { $limit: 1 },
              ],
              as: "_vtMatch",
            },
          },
          { $match: { "_vtMatch.0": { $exists: true } } },
        ]
      : []),
    {
      $project: {
        _id: 1,
        location: 1,
        "basicInfo.name": 1,
        "basicInfo.media.logo": 1,
        "basicInfo.media.logoMarker": 1,
      },
    },
  ];

  const items = await Organizations.aggregate(pipeline).allowDiskUse(true);

  let favSet = null;
  if (userId && items.length) {
    const favs = await Favorites.find({
      user: userId,
      targetType: "organization",
      targetId: { $in: items.map((i) => i._id) },
    })
      .select("targetId")
      .lean();
    favSet = new Set(favs.map((f) => String(f.targetId)));
  }

  return items.map((i) => formatPlaceMarker(i, favSet));
}

async function fetchLeanEvents({
  bounds,
  keyword = "",
  advanceFilters = {},
  userId = null,
  timezone = "UTC",
}) {
  const now = getCurrentDateInTimezone({ timezone });

  const matchFilter = {
    status: "active",
    "schedule.endDateTime": { $gte: now },
  };

  if (keyword?.trim()) {
    matchFilter.$or = [
      { "basicInfo.title": { $regex: keyword.trim(), $options: "i" } },
      { "basicInfo.description": { $regex: keyword.trim(), $options: "i" } },
    ];
  }

  const tagObjIds = (advanceFilters.tags || [])
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (tagObjIds.length) {
    matchFilter["basicInfo.tags"] = { $in: tagObjIds };
  }

  if (bounds?.northEast && bounds?.southWest) {
    matchFilter["basicInfo.venueLocation"] = {
      $geoWithin: {
        $box: [
          [bounds.southWest.longitude, bounds.southWest.latitude],
          [bounds.northEast.longitude, bounds.northEast.latitude],
        ],
      },
    };
  }

  const venueTypeObjIds = await resolveMapVenueTypeIds(advanceFilters);
  if (
    (advanceFilters.categories || []).length &&
    !(advanceFilters.venueTypes || []).length &&
    !venueTypeObjIds.length
  ) {
    return [];
  }

  const pipeline = [
    { $match: matchFilter },
    ...(venueTypeObjIds.length
      ? [
          {
            $lookup: {
              from: "venues",
              localField: "basicInfo.venue",
              foreignField: "_id",
              pipeline: [
                {
                  $match: {
                    status: "active",
                    venueType: { $in: venueTypeObjIds },
                  },
                },
                { $project: { _id: 1 } },
                { $limit: 1 },
              ],
              as: "_vtMatch",
            },
          },
          { $match: { "_vtMatch.0": { $exists: true } } },
        ]
      : []),
    {
      $project: {
        _id: 1,
        "basicInfo.title": 1,
        "basicInfo.media.name": 1,
        "basicInfo.media.marker": 1,
        "basicInfo.media.type": 1,
        "basicInfo.venueLocation": 1,
        "basicInfo.organization": 1,
        "schedule.startDateTime": 1,
        "schedule.endDateTime": 1,
      },
    },
  ];

  const items = await Events.aggregate(pipeline).allowDiskUse(true);

  let favSet = null;
  if (userId && items.length) {
    const favs = await Favorites.find({
      user: userId,
      targetType: "event",
      targetId: { $in: items.map((i) => i._id) },
    })
      .select("targetId")
      .lean();
    favSet = new Set(favs.map((f) => String(f.targetId)));
  }

  return items.map((i) => formatEventMarker(i, favSet));
}

/**
 * Cached lean places for map viewport.
 */
async function getLeanPlacesForMap(queryData) {
  const {
    bounds,
    keyword = "",
    advanceFilters = {},
    userId = null,
  } = queryData;

  const fp = filtersFingerprint(advanceFilters, keyword);
  const bq = quantizeBounds(bounds);

  // Favorites are user-specific — cache shared geo payload without favs, attach after
  const markers = await cache({
    namespace: "maps:places:lean:v4",
    params: { b: bq, f: fp },
    ttl: 30,
    memoryTtl: 15,
    deferStore: true,
    fetchFn: () =>
      fetchLeanPlaces({
        bounds,
        keyword,
        advanceFilters,
        userId: null,
      }),
  });

  if (!userId || !markers.length) {
    return markers;
  }

  const favs = await Favorites.find({
    user: userId,
    targetType: "organization",
    targetId: { $in: markers.map((m) => m._id) },
  })
    .select("targetId")
    .lean();
  const favSet = new Set(favs.map((f) => String(f.targetId)));
  return markers.map((m) => ({
    ...m,
    isFavorite: favSet.has(String(m._id)),
  }));
}

async function getLeanEventsForMap(queryData) {
  const {
    bounds,
    keyword = "",
    advanceFilters = {},
    userId = null,
    timezone = "UTC",
  } = queryData;

  const fp = filtersFingerprint(advanceFilters, keyword);
  const bq = quantizeBounds(bounds);

  const markers = await cache({
    namespace: "maps:events:lean:v4",
    params: { b: bq, f: fp, tz: timezone || "UTC" },
    ttl: 30,
    memoryTtl: 15,
    deferStore: true,
    fetchFn: () =>
      fetchLeanEvents({
        bounds,
        keyword,
        advanceFilters,
        userId: null,
        timezone,
      }),
  });

  if (!userId || !markers.length) {
    return markers;
  }

  const favs = await Favorites.find({
    user: userId,
    targetType: "event",
    targetId: { $in: markers.map((m) => m._id) },
  })
    .select("targetId")
    .lean();
  const favSet = new Set(favs.map((f) => String(f.targetId)));
  return markers.map((m) => ({
    ...m,
    isFavorite: favSet.has(String(m._id)),
  }));
}

module.exports = {
  getLeanPlacesForMap,
  getLeanEventsForMap,
  quantizeBounds,
};
