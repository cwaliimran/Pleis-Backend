
const { getActiveTagsService } = require("../../../admin/tags/tagsService");
const { getActiveTagsTypes } = require("../../../admin/tagTypes/tagTypesService");
const TagTypesModel = require("../../../admin/tagTypes/TagTypesModel");
const { getPublicVenueTypes } = require("../../../admin/venueTypes/venueTypesService");
const { formatNearByOrganization } = require("../../../commonModules/organizations/formatter/formatOrganization");
const { formatSuggestedClub } = require("../../loyalty/clubMembers/formatters/formatSuggestedClubs");
const { getPublicCategories } = require("../../publicCategories/categoriesService");
const { recordSearchService, getTrendingSearchesService } = require("../../searchSuggestions/searchSuggestionService");
const {
  searchEvents,
  searchOrganizations,
  searchLoyaltyClubs,
} = require("./globalSearchRepo");


const SEARCH_HANDLERS = {
  events: searchEvents,
  organizations: searchOrganizations,
  loyaltyClubs: searchLoyaltyClubs
};


const globalSearchService = async (ctx) => {
  const { type } = ctx;

  const selectedKeys =
    type && type !== "all"
      ? [type]
      : Object.keys(SEARCH_HANDLERS);

  const promises = selectedKeys.map(async (key) => {
    const handler = SEARCH_HANDLERS[key];

    // Unknown type explicitly requested
    if (!handler) {
      if (type && type !== "all") {
        throw new Error(`Unsupported search type: ${type}`);
      }

      // When "all", just skip unknown keys silently
      return null;
    }

    const result = await handler(ctx);

    return {
      key,
      title: mapTitle(key),
      data: result.data.map(item =>
        formatResultItem(key, item, ctx.timezone)
      ),
      meta: result.meta
    };
  });

  const results = await Promise.all(promises);

  // log search only if events/organizations returned something
  const shouldLogSearch =
    results.some(r =>
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
      location: ctx.longitude && ctx.latitude
        ? { coordinates: [ctx.longitude, ctx.latitude] }
        : null,
      radiusKm: ctx.radiusKm || 50,
    });

  }


  // remove null entries
  return results.filter(Boolean);
};


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
      return item //already formatted //formatEventResponse(item);
    case "organizations":
      return formatNearByOrganization(item, timezone);
    case "loyaltyClubs":
      return formatSuggestedClub(item);
    default:
      return item;
  }
}


async function getGlobalFiltersService(userId, timezone, center, radiusKm, categoriesFilter) {
  let [popularSearches, categories, venueTypes, tags, genres] = await Promise.all([
    getTrendingSearchesService({ center, radiusKm }),
    getPublicCategories(),
    getPublicVenueTypes({categoriesFilter}),
    getActiveTagsService(),
    getActiveTagsTypes()
  ]);

  // Final safety filter: only allow tags/genres whose tag-type is currently active.
  const activeTagTypes = await TagTypesModel.find({ status: "active" })
    .select("_id title")
    .lean();

  const activeTagTypeMap = new Map(
    (activeTagTypes || []).map((x) => [String(x._id), { _id: x._id, title: x.title }])
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

  const formatted = {
    total: popularSearches.total,
    keywords: popularSearches.keywords || [],

    categories: mapIdsToTitles(
      popularSearches.categories,
      categories.categories
    ),

    venueTypes: mapIdsToTitles(
      popularSearches.venueTypes,
      venueTypes.venueTypes
    ),

    tags: mapIdsToTitles(
      popularSearches.tags,
      safeTags
    ),

    genre: mapIdsToTitles(
      popularSearches.genre,
      safeGenres
    )
  };

  return {
    popularSearches: formatted,
    categories: categories.categories || [],
    venueTypes: venueTypes.venueTypes || [],
    tags: safeTags,
    genres: safeGenres
  };
}

function mapIdsToTitles(ids = [], lookupList = []) {
  const map = new Map(lookupList.map(x => [String(x._id), x]));

  return ids
    .map(id => map.get(String(id)))
    .filter(Boolean)                          // remove missing ones
    .map(item => ({
      _id: item._id,
      title: item.title || item?.loyaltySettings?.title || "",
      order: item.order || 0
    }));
}


module.exports = {
  globalSearchService,
  getGlobalFiltersService
};