
const mongoose = require("mongoose");
const { getActiveTagsService } = require("../../../admin/tags/tagsService");
const { getActiveTagsTypes } = require("../../../admin/tagTypes/tagTypesService");
const TagTypesModel = require("../../../admin/tagTypes/TagTypesModel");
const { getPublicVenueTypes } = require("../../../admin/venueTypes/venueTypesService");
const { Favorites } = require("../../../commonModules/favorites/Favorite");
const { formatNearByOrganization } = require("../../../commonModules/organizations/formatter/formatOrganization");
const { formatSuggestedClub } = require("../../loyalty/clubMembers/formatters/formatSuggestedClubs");
const { getPublicCategories } = require("../../publicCategories/categoriesService");
const { recordSearchService, getTrendingSearchesService } = require("../../searchSuggestions/searchSuggestionService");
const {
  searchEvents,
  searchOrganizations,
} = require("./globalSearchRepo");
const {
  getForYouOrganizationsForHomeService,
  getNearbyOrganizationsService,
  getTrendingOrganizationsForHomeService,
  getNewlyListedOrganizationsService,
  getSuggestedLoyaltyClubsForHomeService,
  getOrganizationsByPrimaryTagService,
} = require("../../organizationProfile/organizationProfileService");
const { getTopPicksOrganizationsForHomeService } = require("../../topPicksOrganizations/topPicksOrganizationsService");
const { getForYouEventsService, thisWeekEvents } = require("../../events/eventService");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const {
  cacheSearchGeo,
  cacheSearchGlobal,
  cacheSearchUser,
  resolveGeoCell,
  clampNearbyRadiusKm,
  advanceFiltersFingerprint,
  listFingerprint,
  normalizeKeyword,
  pointFromLatLng,
  HOME_GEO_HASH_PRECISION,
} = require("./searchCache");
const { encodeGeohash } = require("../utils/homeGeoCache");
const { NEARBY_RANK_GEOHASH_PRECISION } = require("../utils/homeFeedLimits");
const { parseFilterKeyToken } = require("../utils/sectionFilterKey");

const SEARCH_HANDLERS = {
  events: searchEvents,
  organizations: searchOrganizations,
  //loyaltyClubs: searchLoyaltyClubs
};

/** filterKey sections shared by geo cell (no userId in cache key). */
const GEO_FILTER_KEYS = new Set([
  "topPicks",
  "trendingOrganizations",
  "newlyListedOrganizations",
  "customCategoryByTags",
  "customCategory",
]);

/** filterKey sections personalized / exact-GPS (Near You ranks by live location). */
const USER_FILTER_KEYS = new Set([
  "nearYouOrganizations",
  "forYouOrganizations",
  "forYouEvents",
  "thisWeekEvents",
  "loyaltyClubs",
]);

/** Favorite targetType for filterKey drill-downs (loyaltyClubs has none). */
const FILTER_KEY_FAVORITE_TYPE = {
  forYouEvents: "event",
  thisWeekEvents: "event",
  forYouOrganizations: "organization",
  nearYouOrganizations: "organization",
  topPicks: "organization",
  trendingOrganizations: "organization",
  newlyListedOrganizations: "organization",
  customCategoryByTags: "organization",
};

/**
 * Attach isFavorite after Redis cache.
 * Geo keyword/filter caches are shared across users — never bake this into the payload.
 */
async function attachIsFavoriteFlags(userId, items, targetType) {
  if (!Array.isArray(items) || !items.length || !targetType) return items || [];

  if (!userId) {
    return items.map((item) =>
      item && typeof item === "object" ? { ...item, isFavorite: false } : item
    );
  }

  const ids = items.map((item) => item?._id).filter(Boolean);
  if (!ids.length) {
    return items.map((item) =>
      item && typeof item === "object" ? { ...item, isFavorite: false } : item
    );
  }

  const favs = await Favorites.find({
    user: userId,
    targetType,
    targetId: { $in: ids },
  })
    .select("targetId")
    .lean();

  const favSet = new Set(favs.map((f) => String(f.targetId)));

  return items.map((item) => {
    if (!item || typeof item !== "object") return item;
    return {
      ...item,
      isFavorite: favSet.has(String(item._id)),
    };
  });
}

async function enrichKeywordSectionsWithFavorites(userId, sections) {
  if (!Array.isArray(sections)) return sections;

  return Promise.all(
    sections.map(async (section) => {
      if (!section) return section;
      if (section.key === "events") {
        return {
          ...section,
          data: await attachIsFavoriteFlags(userId, section.data, "event"),
        };
      }
      if (section.key === "organizations") {
        return {
          ...section,
          data: await attachIsFavoriteFlags(
            userId,
            section.data,
            "organization"
          ),
        };
      }
      return section;
    })
  );
}

async function enrichFilterKeyPayloadWithFavorites(userId, filterKey, payload) {
  if (!payload || !Array.isArray(payload.data)) return payload;

  let targetType = FILTER_KEY_FAVORITE_TYPE[filterKey] || null;

  // customCategory objects are Event | Organizations | User — infer from first item
  if (filterKey === "customCategory" && payload.data.length) {
    const sample = payload.data[0];
    if (sample?.schedule != null || sample?.basicInfo?.venueLocation != null) {
      targetType = "event";
    } else if (sample?.basicInfo?.name != null) {
      targetType = "organization";
    }
  }

  if (!targetType) return payload;

  return {
    ...payload,
    data: await attachIsFavoriteFlags(userId, payload.data, targetType),
  };
}
function toValidObjectIds(ids) {
  return [...(Array.isArray(ids) ? ids : ids ? [ids] : [])]
    .filter((id) => isStrictObjectId(id))
    .map((id) => String(id));
}

function isStrictObjectId(id) {
  if (id == null || id === "") return false;
  const s = String(id);
  return (
    mongoose.Types.ObjectId.isValid(s) &&
    String(new mongoose.Types.ObjectId(s)) === s
  );
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Resolve tag ids for customCategoryByTags drill-down.
 * Accepts advanceFilters.tags, body/query tagId, or title fallback.
 */
async function resolveTagIdsForFilterKey(ctx) {
  const fromFilters = toValidObjectIds(ctx.advanceFilters?.tags);
  if (fromFilters.length) return fromFilters;

  const fromTagId = toValidObjectIds(ctx.tagId);
  if (fromTagId.length) return fromTagId;

  const title = String(ctx.title || "").trim();
  if (!title) return [];

  const Tags = require("@TagsModel");
  const found = await Tags.find({
    status: "active",
    title: { $regex: `^${escapeRegex(title)}$`, $options: "i" },
  })
    .select("_id")
    .lean();
  return found.map((t) => String(t._id));
}

/**
 * Map opaque ?filterKey= token from the client to an internal route.
 * Preferred tokens come from home section.filterKey (send as-is).
 */
async function resolveFilterKeyRoute(ctx) {
  const parsed = parseFilterKeyToken(ctx.filterKey);
  const raw = parsed.raw;

  if (parsed.kind === "unknown" || !raw) {
    throw new Error("filterKey required");
  }

  if (parsed.kind === "static") {
    return {
      filterKey: parsed.id,
      cacheKind: USER_FILTER_KEYS.has(parsed.id) ? "user" : "geo",
      ctx: { ...ctx, filterKey: parsed.id },
    };
  }

  if (parsed.kind === "tag") {
    if (!isStrictObjectId(parsed.id)) {
      throw new Error(`Unsupported filterKey: ${raw}`);
    }
    return {
      filterKey: "customCategoryByTags",
      cacheKind: "geo",
      ctx: {
        ...ctx,
        filterKey: "customCategoryByTags",
        tagId: parsed.id,
      },
    };
  }

  if (parsed.kind === "customCategory") {
    if (!isStrictObjectId(parsed.id)) {
      throw new Error(`Unsupported filterKey: ${raw}`);
    }
    return {
      filterKey: "customCategory",
      cacheKind: "geo",
      ctx: {
        ...ctx,
        filterKey: "customCategory",
        customCategoryId: parsed.id,
      },
    };
  }

  // Legacy fallbacks: bare ObjectId or title
  const Tags = require("@TagsModel");
  const CustomCategories = require("../../../admin/customCategories/CustomCategories");

  if (isStrictObjectId(raw)) {
    const tag = await Tags.findOne({ _id: raw, status: "active" })
      .select("_id")
      .lean();
    if (tag) {
      return {
        filterKey: "customCategoryByTags",
        cacheKind: "geo",
        ctx: {
          ...ctx,
          filterKey: "customCategoryByTags",
          tagId: raw,
        },
      };
    }

    const custom = await CustomCategories.findOne({
      _id: raw,
      status: { $ne: "deleted" },
    })
      .select("_id")
      .lean();
    if (custom) {
      return {
        filterKey: "customCategory",
        cacheKind: "geo",
        ctx: {
          ...ctx,
          filterKey: "customCategory",
          customCategoryId: raw,
        },
      };
    }
  }

  const tagByTitle = await Tags.findOne({
    status: "active",
    title: { $regex: `^${escapeRegex(raw)}$`, $options: "i" },
  })
    .select("_id title")
    .lean();
  if (tagByTitle) {
    return {
      filterKey: "customCategoryByTags",
      cacheKind: "geo",
      ctx: {
        ...ctx,
        filterKey: "customCategoryByTags",
        tagId: String(tagByTitle._id),
        title: tagByTitle.title || raw,
      },
    };
  }

  const customByTitle = await CustomCategories.findOne({
    status: { $ne: "deleted" },
    title: { $regex: `^${escapeRegex(raw)}$`, $options: "i" },
  })
    .select("_id title")
    .lean();
  if (customByTitle) {
    return {
      filterKey: "customCategory",
      cacheKind: "geo",
      ctx: {
        ...ctx,
        filterKey: "customCategory",
        customCategoryId: String(customByTitle._id),
        title: customByTitle.title || raw,
      },
    };
  }

  throw new Error(`Unsupported filterKey: ${raw}`);
}

async function fetchCustomCategoryObjects({
  ctx,
  page,
  limit,
  skip,
}) {
  const customCategoryRepo = require("../../customCategories/customCategoriesRepository");
  const {
    transformCustomCategoryObjects,
  } = require("../../customCategories/customCategoriesService");

  const idCandidates = toValidObjectIds(
    ctx.customCategoryId || ctx.advanceFilters?.customCategoryId
  );
  const title = String(ctx.title || "").trim();

  const filter = { status: { $ne: "deleted" } };
  if (idCandidates.length) {
    filter._id = new mongoose.Types.ObjectId(idCandidates[0]);
  } else if (title) {
    filter.title = {
      $regex: `^${escapeRegex(title)}$`,
      $options: "i",
    };
  } else {
    throw new Error(
      "customCategoryId required: use home section.filterKey as ?filterKey=, or pass body.customCategoryId"
    );
  }

  const rows = await customCategoryRepo.getCustomCategoriesWithFilters(
    ctx.userId,
    ctx.timezone,
    filter,
    0,
    1,
    { order: 1 },
    Array.isArray(ctx.advanceFilters?.categories)
      ? ctx.advanceFilters.categories[0]
      : ctx.advanceFilters?.categories || null
  );

  const category = rows?.[0];
  if (!category) {
    return { data: [], meta: generateMeta(page, limit, 0) };
  }

  const userLocation = pointFromLatLng(ctx.latitude, ctx.longitude);
  const objects = (category.objects || [])
    .map((obj) =>
      transformCustomCategoryObjects(
        obj,
        category.type,
        userLocation,
        ctx.timezone
      )
    )
    .filter(Boolean);

  const totalCount = objects.length;
  const data = objects.slice(skip, skip + limit);
  return { data, meta: generateMeta(page, limit, totalCount) };
}

const globalSearchService = async (ctx) => {
  const { type } = ctx;
  const radiusKm = clampNearbyRadiusKm(ctx.radiusKm ?? 50);
  const userLocation = pointFromLatLng(ctx.latitude, ctx.longitude);
  const cell = resolveGeoCell(userLocation, HOME_GEO_HASH_PRECISION);
  // Shared geo queries use cell center so neighbors share one Redis entry
  const geoQueryLocation = cell.centerPoint || userLocation;
  const keywordNorm = normalizeKeyword(ctx.keyword);
  const afFp = advanceFiltersFingerprint(ctx.advanceFilters);

  const searchCtx = {
    ...ctx,
    radiusKm,
    // Repo/events still read latitude/longitude — point handlers at cell center when geo
    latitude: geoQueryLocation
      ? geoQueryLocation.coordinates[1]
      : ctx.latitude,
    longitude: geoQueryLocation
      ? geoQueryLocation.coordinates[0]
      : ctx.longitude,
  };

  const cachedSections = await cacheSearchGeo({
    section: "keyword",
    geoHash: cell.hash,
    params: {
      kw: keywordNorm || "_",
      type: type || "all",
      page: Number(ctx.page) || 1,
      limit: Number(ctx.limit) || 10,
      sort: ctx.sort || "desc",
      tz: ctx.timezone || "default",
      r: radiusKm,
      af: afFp,
    },
    fetchFn: () => fetchKeywordSearchSections(searchCtx, type),
  });

  // User-specific — must run after shared geo cache
  const sections = await enrichKeywordSectionsWithFavorites(
    ctx.userId,
    cachedSections
  );

  // Side effect outside cache — still record on warm hits when results exist
  const shouldLogSearch = sections.some(
    (r) =>
      r &&
      ["events", "organizations"].includes(r.key) &&
      r.data &&
      r.data.length > 0
  );

  if (shouldLogSearch) {
    recordSearchService({
      userId: ctx.userId,
      keyword: ctx.keyword,
      filters: {
        categories: ctx.advanceFilters?.categories || [],
        venueTypes: ctx.advanceFilters?.venueTypes || [],
        tags: ctx.advanceFilters?.tags || [],
        genre: ctx.advanceFilters?.genre || [],
      },
      location:
        ctx.longitude && ctx.latitude
          ? { coordinates: [ctx.longitude, ctx.latitude] }
          : null,
      radiusKm,
    });
  }

  return sections;
};

async function fetchKeywordSearchSections(ctx, type) {
  const selectedKeys =
    type && type !== "all" ? [type] : Object.keys(SEARCH_HANDLERS);

  const promises = selectedKeys.map(async (key) => {
    const handler = SEARCH_HANDLERS[key];

    if (!handler) {
      if (type && type !== "all") {
        throw new Error(`Unsupported search type: ${type}`);
      }
      return null;
    }

    const result = await handler(ctx);

    return {
      key,
      title: mapTitle(key),
      data: result.data.map((item) =>
        formatResultItem(key, item, ctx.timezone)
      ),
      meta: result.meta,
    };
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

/**
 * Home "see all" / section drill-down via filterKey.
 * Returns { data, meta } — same shape the controller already sent.
 */
const getFilterKeySearchService = async (ctx) => {
  const resolved = await resolveFilterKeyRoute(ctx);
  const filterKey = resolved.filterKey;
  const resolvedCtx = resolved.ctx;

  const radiusKm = clampNearbyRadiusKm(resolvedCtx.radiusKm ?? 50);
  const userLocation = pointFromLatLng(
    resolvedCtx.latitude,
    resolvedCtx.longitude
  );
  const cell = resolveGeoCell(userLocation, HOME_GEO_HASH_PRECISION);
  const geoQueryLocation = cell.centerPoint || userLocation;
  const page = Number(resolvedCtx.page) || 1;
  const limit = Number(resolvedCtx.limit) || 10;
  const skip = (page - 1) * limit;
  const afFp = advanceFiltersFingerprint(resolvedCtx.advanceFilters || {});
  const catFp = listFingerprint(
    Array.isArray(resolvedCtx.advanceFilters?.categories)
      ? resolvedCtx.advanceFilters.categories
      : resolvedCtx.advanceFilters?.categories
        ? [resolvedCtx.advanceFilters.categories]
        : []
  );

  const baseParams = {
    page,
    limit,
    tz: resolvedCtx.timezone || "default",
    r: radiusKm,
    cat: catFp || "all",
    af: afFp,
    tag:
      listFingerprint(
        toValidObjectIds(
          resolvedCtx.tagId || resolvedCtx.advanceFilters?.tags
        )
      ) || "none",
    cc:
      listFingerprint(
        toValidObjectIds(
          resolvedCtx.customCategoryId ||
            resolvedCtx.advanceFilters?.customCategoryId
        )
      ) || "none",
    title: String(resolvedCtx.title || "").trim().toLowerCase() || "_",
  };

  const useGeoCenter = GEO_FILTER_KEYS.has(filterKey);
  const run = () =>
    fetchFilterKeyPayload({
      filterKey,
      ctx: resolvedCtx,
      userLocation: useGeoCenter ? geoQueryLocation : userLocation,
      radiusKm,
      page,
      limit,
      skip,
    });

  let payload;
  if (resolved.cacheKind === "geo" || GEO_FILTER_KEYS.has(filterKey)) {
    payload = await cacheSearchGeo({
      section: `fk:${filterKey}`,
      geoHash: cell.hash,
      params: baseParams,
      fetchFn: run,
    });
  } else if (resolved.cacheKind === "user" || USER_FILTER_KEYS.has(filterKey)) {
    const fineGeo =
      filterKey === "nearYouOrganizations" && userLocation
        ? encodeGeohash(
            userLocation.coordinates[1],
            userLocation.coordinates[0],
            NEARBY_RANK_GEOHASH_PRECISION
          ) || cell.hash
        : cell.hash;

    payload = await cacheSearchUser({
      section: `fk:${filterKey}`,
      userId: resolvedCtx.userId,
      params: {
        ...baseParams,
        geo: fineGeo,
      },
      fetchFn: run,
    });
  } else {
    throw new Error(`Unsupported filterKey: ${filterKey}`);
  }

  // User-specific — after cache (geo keys are shared across users)
  return enrichFilterKeyPayloadWithFavorites(
    resolvedCtx.userId,
    filterKey,
    payload
  );
};

async function fetchFilterKeyPayload({
  filterKey,
  ctx,
  userLocation,
  radiusKm,
  page,
  limit,
  skip,
}) {
  const { userId, timezone, advanceFilters } = ctx;
  const category = advanceFilters?.categories;

  switch (filterKey) {
    case "forYouOrganizations": {
      const { organizations, totalCount } =
        await getForYouOrganizationsForHomeService({
          category,
          userLocation,
          radiusKm,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx,
        });
      return {
        data: organizations,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "nearYouOrganizations": {
      const { organizations, totalCount } = await getNearbyOrganizationsService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page,
        limit,
        skip,
        userId,
        ctx,
      });
      return {
        data: organizations,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "topPicks": {
      const { topPicksOrganizations, totalCount } =
        await getTopPicksOrganizationsForHomeService({
          category,
          userLocation,
          radiusKm,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx,
        });
      return {
        data: topPicksOrganizations,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "trendingOrganizations": {
      const { organizations, totalCount } =
        await getTrendingOrganizationsForHomeService({
          category,
          userLocation,
          radiusKm,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx,
        });
      return {
        data: organizations,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "forYouEvents": {
      const { recommendedEvents, totalCount } = await getForYouEventsService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page,
        limit,
        skip,
        userId,
        ctx,
      });
      return {
        data: recommendedEvents,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "thisWeekEvents": {
      const { data, totalCount } = await thisWeekEvents({
        category,
        userLocation,
        radiusKm,
        timezone,
        page,
        limit,
        skip,
        userId,
        ctx,
      });
      return {
        data,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "newlyListedOrganizations": {
      const { organizations, totalCount } =
        await getNewlyListedOrganizationsService({
          category,
          userLocation,
          radiusKm,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx,
        });
      return {
        data: organizations,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "loyaltyClubs": {
      const { loyaltyClubs, totalCount } =
        await getSuggestedLoyaltyClubsForHomeService({
          userLocation,
          radiusKm,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx,
        });
      return {
        data: loyaltyClubs,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "customCategoryByTags": {
      const tagIds = await resolveTagIdsForFilterKey(ctx);
      if (!tagIds.length) {
        throw new Error(
          "tagId required: use home section.filterKey (tag id) as ?filterKey=, or pass body.tagId"
        );
      }
      // Same primary-tag + distance query as home customCategoryByTags sections
      const { organizations, totalCount } =
        await getOrganizationsByPrimaryTagService({
          tagId: tagIds[0],
          userLocation,
          radiusKm,
          timezone,
          page,
          limit,
          skip,
          userId,
          category: Array.isArray(category) ? category[0] : category,
        });
      return {
        data: organizations,
        meta: generateMeta(page, limit, totalCount),
      };
    }
    case "customCategory": {
      return fetchCustomCategoryObjects({ ctx, page, limit, skip });
    }
    default:
      throw new Error(`Unsupported filterKey: ${filterKey}`);
  }
}

function mapTitle(key) {
  switch (key) {
    case "events": return "Events";
    case "organizations": return "Organizers";
    case "loyaltyClubs": return "Loyalty Clubs";
    default: return key;
  }
}

function formatResultItem(key, item, timezone) {
  switch (key) {
    case "events":
      return item; // already formatted
    case "organizations":
      return formatNearByOrganization(item, timezone);
    case "loyaltyClubs":
      return formatSuggestedClub(item);
    default:
      return item;
  }
}

async function getGlobalFiltersService(userId, timezone, center, radiusKm, categoriesFilter) {
  const radius = clampNearbyRadiusKm(radiusKm ?? 50);
  const cell = resolveGeoCell(center, HOME_GEO_HASH_PRECISION);
  const geoCenter = cell.centerPoint || center;
  const catFp = listFingerprint(categoriesFilter);

  // Catalogs: shared globally (venueTypes vary by categoriesFilter)
  const catalogs = await cacheSearchGlobal({
    section: "filters-catalogs",
    params: { cat: catFp || "all" },
    fetchFn: () => fetchFilterCatalogs(categoriesFilter),
  });

  // Trending / popular searches: geo-cell scoped
  const popularRaw = await cacheSearchGeo({
    section: "filters-trending",
    geoHash: cell.hash,
    params: { r: radius },
    fetchFn: () =>
      getTrendingSearchesService({ center: geoCenter, radiusKm: radius }),
  });

  const {
    categories,
    venueTypes,
    tags: safeTags,
    genres: safeGenres,
  } = catalogs;

  const formatted = {
    total: popularRaw.total,
    keywords: popularRaw.keywords || [],
    categories: mapIdsToTitles(popularRaw.categories, categories),
    venueTypes: mapIdsToTitles(popularRaw.venueTypes, venueTypes),
    tags: mapIdsToTitles(popularRaw.tags, safeTags),
    genre: mapIdsToTitles(popularRaw.genre, safeGenres),
  };

  return {
    popularSearches: formatted,
    categories: categories || [],
    venueTypes: venueTypes || [],
    tags: safeTags,
    genres: safeGenres,
  };
}

async function fetchFilterCatalogs(categoriesFilter) {
  const [categories, venueTypes, tags, genres] = await Promise.all([
    getPublicCategories(),
    getPublicVenueTypes({ categories: categoriesFilter || [] }),
    getActiveTagsService(),
    getActiveTagsTypes(),
  ]);

  const activeTagTypes = await TagTypesModel.find({ status: "active" })
    .select("_id title")
    .lean();

  const activeTagTypeMap = new Map(
    (activeTagTypes || []).map((x) => [
      String(x._id),
      { _id: x._id, title: x.title },
    ])
  );

  const safeGenres = (genres?.tagTypes || []).filter((g) =>
    activeTagTypeMap.has(String(g?._id))
  );

  const safeTags = (tags?.tags || [])
    .filter((tag) => activeTagTypeMap.has(String(tag?.type?._id)))
    .map((tag) => ({
      ...tag,
      type: activeTagTypeMap.get(String(tag.type._id)),
    }));

  return {
    categories: categories.categories || [],
    venueTypes: venueTypes.venueTypes || [],
    tags: safeTags,
    genres: safeGenres,
  };
}

function mapIdsToTitles(ids = [], lookupList = []) {
  const map = new Map(lookupList.map((x) => [String(x._id), x]));

  return ids
    .map((id) => map.get(String(id)))
    .filter(Boolean)
    .map((item) => ({
      _id: item._id,
      title: item.title || item?.loyaltySettings?.title || "",
      order: item.order || 0,
    }));
}

module.exports = {
  globalSearchService,
  getGlobalFiltersService,
  getFilterKeySearchService,
};
