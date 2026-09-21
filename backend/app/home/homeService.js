const { getPublicHighlights } = require("../highlights/highlightService");
const { getCustomCategories } = require("../customCategories/customCategoriesService");
const { getForYouEventsService, thisWeekEvents } = require("../events/eventService");
const { getPublicCategoriesForHome } = require("../publicCategories/categoriesService");
const { getPopularEventsForHomeService } = require("../popularEvents/popularEventsService");

const {
  getSuggestedLoyaltyClubsForHomeService,
  getNearbyOrganizationsService,
  getNewlyListedOrganizationsService,
  getForYouOrganizationsForHomeService,
  getTrendingOrganizationsForHomeService,
  getOrganizationsGroupedByTagsService,
} = require("../organizationProfile/organizationProfileService");

const { getBannerControlsForHomeService } = require("./bannerControl/bannerControlsService");
const { getTopPicksOrganizationsForHomeService } = require("../topPicksOrganizations/topPicksOrganizationsService");
const { getLoyaltyAndGlobalLoyaltyPromotions } = require("./promotions/promotionsHomeService");
const { getOrganizationsWithReservationsForHomeService } = require("../reservations/reservationService");

const { pushIfValid } = require("./utils/feedPushRules");
const { findGlobalReferralSettingsDirect } = require("../../admin/globalLoyalty/globalReferral/globalReferralRepository");
const { getAppSettings } = require("../appSettings/appSettingsController");
const {
  findPinnedContentWithFilters,
} = require("../../admin/pinnedContent/pinnedContentRepository");
const { getEventsBatch } = require("../../admin/events/eventService");
const { getOrganizationsBatch } = require("../../admin/organizations/organizationService");
const { findOrCreateFeedConfigDirect } = require("../../admin/feedConfig/feedConfigRepository");
const {
  resolveGeoCell,
  cacheHomeGeo,
  cacheHomeGlobal,
  cacheHomeUser,
  encodeGeohash,
} = require("./utils/homeGeoCache");
const {
  HOME_GEO_HASH_PRECISION,
  HOME_GEO_SECTION_TTL,
  HOME_GLOBAL_SECTION_TTL,
  HOME_SECTION_LIMIT,
  NEARBY_RANK_GEOHASH_PRECISION,
  clampNearbyRadiusKm,
} = require("./utils/homeFeedLimits");

/**
 * Home feed caching (geo-cell):
 * - global: categories / banners / referral (no lat/lng, no userId)
 * - geo: popularEvents, topPicks, trending, newlyListed, tagGroups, pinned
 *   keyed by geohash precision 5 (~neighborhood), TTL 60s — NOT raw lat/lng or userId
 * - user: forYou*, thisWeek, reservations, customCategories, highlights, loyalty, promotions
 *   keyed by userId + tz/r/cat (home:user:v1:bundle), TTL same as geo (60s)
 * - nearYou: EXACT request GPS (not cell center). Cached per user + fine geohash p7 (~150m)
 *   so ranking prefers venues closest to the live location. Score = exp(-km / τ), τ=5.
 *
 * Shared geo queries (non-nearYou) use the cell center so users in the same cell share one Redis entry.
 * Search / filters: see globalSearch/searchCache.js + globalSearchService.js.
 */

const HOME_PROFILE = process.env.HOME_PROFILE === "1";
const profileTimed = async (label, fn) => {
  if (!HOME_PROFILE) return fn();
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[HOME_PROFILE] ${label} ${Date.now() - t0}ms`);
  }
};

const fetchGlobalHomeSections = async () => {
  return cacheHomeGlobal({
    section: "bundle",
    params: {},
    ttl: HOME_GLOBAL_SECTION_TTL,
    fetchFn: async () => {
      // Overlap feedConfig with banners/referral/categories; all skip nested Azure Redis
      // (home:global bundle already caches the combined result).
      const [feedConfig, bannersRes, getGlobalReferralSettingsRes, categoriesMaybe] =
        await Promise.all([
          profileTimed("global.feedConfig", () => findOrCreateFeedConfigDirect()),
          profileTimed("global.banners", () =>
            getBannerControlsForHomeService({ page: 1, limit: 10 })
          ),
          profileTimed("global.referral", () => findGlobalReferralSettingsDirect()),
          profileTimed("global.categories", () =>
            getPublicCategoriesForHome({ status: "active" })
          ),
        ]);

      return {
        ...(feedConfig?.quickAction ? { categoriesRes: categoriesMaybe } : {}),
        bannersRes,
        getGlobalReferralSettingsRes,
      };
    },
  });
};

const fetchGeoHomeSections = async ({
  geoHash,
  geoQueryLocation,
  radiusKm,
  timezone,
  category,
}) => {
  return cacheHomeGeo({
    section: "bundle",
    geoHash,
    params: {
      tz: timezone || "default",
      r: Number(radiusKm) || 50,
      cat: category ? String(category) : "all",
    },
    ttl: HOME_GEO_SECTION_TTL,
    fetchFn: async () => {
      // Cell-center location keeps results stable for everyone in the hash cell
      const loc = geoQueryLocation;

      const promises = {
        popularEventsRes: profileTimed("geo.popularEvents", () =>
          getPopularEventsForHomeService({
            limit: 10,
            skip: 0,
            timezone,
            category,
            userLocation: loc,
            radiusKm,
          })
        ),
        topPicksOrgs: profileTimed("geo.topPicks", () =>
          getTopPicksOrganizationsForHomeService({
            category,
            page: 1,
            limit: 10,
            skip: 0,
            userLocation: loc,
            radiusKm,
          })
        ),
        trendingOrganizationsService: profileTimed("geo.trending", () =>
          getTrendingOrganizationsForHomeService({
            category,
            userLocation: loc,
            radiusKm,
            timezone,
            page: 1,
            limit: 10,
            skip: 0,
            userId: null,
          })
        ),
        newlyListedOrganizationsService: profileTimed("geo.newlyListed", () =>
          getNewlyListedOrganizationsService({
            category,
            userLocation: loc,
            radiusKm,
            timezone,
            page: 1,
            limit: 10,
            skip: 0,
            userId: null,
          })
        ),
        getOrganizationsGroupedByTagsRes: profileTimed("geo.tagGroups", () =>
          getOrganizationsGroupedByTagsService({
            userLocation: loc,
            radiusKm,
            timezone,
            userId: null,
            category,
          })
        ),
        // Covered by parent home:geo:v1:bundle key — no nested Redis lock
        pinnedContentRes: profileTimed("geo.pinned", () =>
          fetchPinnedContentData({
            timezone,
            userLocation: loc,
            radiusKm,
          })
        ),
      };

      const resultsArray = await Promise.all(Object.values(promises));
      return Object.fromEntries(
        Object.keys(promises).map((k, i) => [k, resultsArray[i]])
      );
    },
  });
};

/**
 * Near You — always query with the request's exact GPS (not geohash cell center).
 * Cache per user + fine geohash (~150m) so tiny GPS jitter still hits L1/Redis.
 */
const fetchNearYouForHome = async ({
  userId,
  userLocation,
  radiusKm,
  timezone,
  category,
}) => {
  const run = () =>
    getNearbyOrganizationsService({
      category,
      userLocation,
      radiusKm,
      timezone,
      page: 1,
      limit: HOME_SECTION_LIMIT,
      skip: 0,
      userId: null,
    });

  if (!userLocation) {
    return run();
  }

  const ll = userLocation.coordinates;
  const lat = Array.isArray(ll) ? ll[1] : null;
  const lng = Array.isArray(ll) ? ll[0] : null;
  const fineGeo =
    encodeGeohash(lat, lng, NEARBY_RANK_GEOHASH_PRECISION) || "global";

  return cacheHomeUser({
    section: "nearYou",
    userId,
    params: {
      geo: fineGeo,
      tz: timezone || "default",
      r: Number(radiusKm) || 50,
      cat: category ? String(category) : "all",
    },
    ttl: HOME_GEO_SECTION_TTL,
    fetchFn: run,
  });
};

const fetchUserHomeSections = async ({
  userId,
  userLocation,
  radiusKm,
  timezone,
  category,
}) => {
  return cacheHomeUser({
    section: "bundle",
    userId,
    params: {
      tz: timezone || "default",
      r: Number(radiusKm) || 50,
      cat: category ? String(category) : "all",
    },
    ttl: HOME_GEO_SECTION_TTL,
    fetchFn: async () => {
      const promises = {
        forYouEvents: profileTimed("user.forYouEvents", () =>
          getForYouEventsService({
            category,
            userLocation,
            radiusKm,
            timezone,
            page: 1,
            limit: 10,
            userId,
          })
        ),
        thisWeekEventsRes: profileTimed("user.thisWeek", () =>
          thisWeekEvents({
            timezone,
            category,
            userLocation,
            radiusKm,
            page: 1,
            limit: 10,
            skip: 0,
            userId,
          })
        ),
        getOrganizationsWithReservationsRes: profileTimed("user.reservations", () =>
          getOrganizationsWithReservationsForHomeService({
            userId,
            userLocation,
            radiusKm,
            timezone,
            category,
          })
        ),
        getForYouOrganizationsService: profileTimed("user.forYouOrgs", () =>
          getForYouOrganizationsForHomeService({
            category,
            userLocation,
            radiusKm,
            timezone,
            page: 1,
            limit: 10,
            skip: 0,
            userId,
          })
        ),
        customCategoriesRes: profileTimed("user.customCategories", () =>
          getCustomCategories({
            userLocation,
            userId,
            timezone,
            page: 1,
            limit: 10,
            status: "active",
            category,
          })
        ),
        highlightsRes: profileTimed("user.highlights", () =>
          getPublicHighlights({
            userId,
            page: 1,
            limit: 10,
            userLocation,
            radiusKm,
            category,
            timezone,
          })
        ),
        suggestedLoyaltyClubsRes: profileTimed("user.loyaltyClubs", () =>
          getSuggestedLoyaltyClubsForHomeService({
            page: 1,
            limit: 10,
            skip: 0,
            userId,
            userLocation,
            radiusKm,
          })
        ),
        loyaltyAndGlobalLoyaltyPromotions: profileTimed("user.promotions", () =>
          getLoyaltyAndGlobalLoyaltyPromotions({
            page: 1,
            limit: 5,
            userId,
            timezone,
          })
        ),
      };

      const resultsArray = await Promise.all(Object.values(promises));
      return Object.fromEntries(
        Object.keys(promises).map((k, i) => [k, resultsArray[i]])
      );
    },
  });
};

const getHomeService = async ({ queryData }) => {
  const { userId, userLocation, timezone, category } = queryData;
  // Clamp before geo cache keys (r:) and section queries so radiusKm=500 → r=50
  const radiusKm = clampNearbyRadiusKm(queryData.radiusKm ?? 50);

  try {
    const frequencyMap = {
      orgs: new Map(),
      events: new Map(),
    };

    const geoCell = resolveGeoCell(userLocation, HOME_GEO_HASH_PRECISION);
    // Prefer cell center for shared geo sections; fall back to exact point / null (global mode)
    const geoQueryLocation = geoCell.centerPoint || userLocation || null;

    // Start bundles together — nearYou is separate so it uses EXACT GPS, not cell center
    const [globalSections, geoSections, userSections, nearYouOrganizationsRes] =
      await Promise.all([
        profileTimed("bundle.global", () => fetchGlobalHomeSections()),
        profileTimed("bundle.geo", () =>
          fetchGeoHomeSections({
            geoHash: geoCell.hash,
            geoQueryLocation,
            radiusKm,
            timezone,
            category,
          })
        ),
        profileTimed("bundle.user", () =>
          fetchUserHomeSections({
            userId,
            userLocation,
            radiusKm,
            timezone,
            category,
          })
        ),
        profileTimed("bundle.nearYou", () =>
          fetchNearYouForHome({
            userId,
            userLocation,
            radiusKm,
            timezone,
            category,
          })
        ),
      ]);

    const results = {
      ...globalSections,
      ...geoSections,
      ...userSections,
      nearYouOrganizationsRes,
    };

    /**
     * NORMALIZATION
     */
    let categories = results.categoriesRes?.categories || [];
    const banners = results.bannersRes?.bannerControls || [];
    const getGlobalReferralSettings = results.getGlobalReferralSettingsRes || null;
    const popularEvents = results.popularEventsRes?.data || [];
    const highlights = results.highlightsRes?.highlights || [];
    const customCategories = results.customCategoriesRes?.customCategories || [];
    const tagGroups = results.getOrganizationsGroupedByTagsRes || [];
    const pinnedContent = results.pinnedContentRes || [];

    /**
 * PINNED QUEUE
 */
    const pinnedQueue = [...pinnedContent];

    const pushPinned = (flushAll = false) => {
      if (!pinnedQueue.length) return;

      const extractItems = (p) => {
        const d = p?.data;

        if (!d) return [];

        // Case 1: direct array (Events, etc.)
        if (Array.isArray(d)) return d;

        // Case 2: wrapped arrays (Organizations, future types)
        if (Array.isArray(d.events)) return d.events;
        if (Array.isArray(d.organizations)) return d.organizations;


        // Case 3: generic fallback (future-proof)
        for (const key of Object.keys(d)) {
          if (Array.isArray(d[key])) return d[key];
        }

        return [];
      };

      const process = (p) => {
        const items = extractItems(p);

        pushIfValid(
          feed,
          {
            key: "pinnedContent",
            subKey: p?.contentType,
            id: p?.pinnedId,
            title: p?.filter?.title || "Pinned Content",
            data: items,
          },
          frequencyMap,
          { allowEmpty: true }
        );
      };

      if (flushAll) {
        while (pinnedQueue.length) {
          process(pinnedQueue.shift());
        }
      } else {
        process(pinnedQueue.shift());
      }
    };

    /**
     * HANDLE CUSTOM + TAG MIX
     */
    let customQueue = [...customCategories];
    let tagQueue = [...tagGroups];
    //shuffle tagQueue randomly
    tagQueue.sort(() => Math.random() - 0.5);



    const pushCustomCategory = (flushAll = false) => {
      if (!customQueue.length) return;

      if (flushAll) {
        while (customQueue.length) {
          const cat = customQueue.shift();
          if (cat?.objects?.length) {
            pushIfValid(feed, {
              key: "customCategory",
              title: cat?.title,
              customCategoryId: cat?._id || null,
              data: cat?.objects,
            }, frequencyMap);
          }
        }
      } else {
        const c = customQueue.shift();
        if (!c?.objects?.length) return;

        pushIfValid(feed, {
          key: "customCategory",
          title: c?.title,
          customCategoryId: c?._id || null,
          data: c?.objects,
        }, frequencyMap);
      }
    };

    const pushCustomCategoryByTags = (flushAll = false) => {
      if (!tagQueue.length) return;

      const pushOne = (tg) => {
        if (!tg?.data?.length) return false;

        pushIfValid(feed, {
          key: "customCategoryByTags",
          title: tg?.title,
          tagId: tg?.tagId || null,
          data: tg?.data,
        }, frequencyMap);

        return true;
      };

      if (flushAll) {
        // Push first 3 then flush the rest to ensure some tag-based content appears early but still get variety
        tagQueue.splice(0, 3).forEach(pushOne);
      } else {
        while (tagQueue.length) {
          if (pushOne(tagQueue.shift())) break; // push first valid
        }
      }
    };





    const feed = [];

    /**
     * FIXED SECTIONS
     */
    pushIfValid(feed, { key: "categories", title: "Categories", data: categories }, frequencyMap);
    pushIfValid(feed, { key: "banners", title: "Banners", data: banners }, frequencyMap);

    /**
     * ORGS
     */
    pushIfValid(feed, {
      key: "forYouOrganizations",
      title: "For You",
      data: results.getForYouOrganizationsService?.organizations || [],
    }, frequencyMap);

    pushIfValid(feed, {
      key: "nearYouOrganizations",
      title: "Near You",
      data: results.nearYouOrganizationsRes?.organizations || [],
    }, frequencyMap);

    pushIfValid(feed, {
      key: "topPicks",
      title: "Top Picks",
      data: results.topPicksOrgs?.topPicksOrganizations || [],
    }, frequencyMap);

    pushIfValid(feed, {
      key: "trendingOrganizations",
      title: "Trending",
      data: results.trendingOrganizationsService?.organizations || [],
    }, frequencyMap);

    pushIfValid(feed, {
      key: "reservations",
      title: "Make a Reservation",
      data: results.getOrganizationsWithReservationsRes || [],
    }, frequencyMap);

    pushCustomCategory();
    pushPinned();
    /**
     * EVENTS
     */
    pushIfValid(feed, {
      key: "popularEvents",
      title: "Popular Events",
      data: popularEvents,
    }, frequencyMap);

    pushIfValid(feed, {
      key: "forYouEvents",
      title: "For You Events",
      data: results.forYouEvents?.recommendedEvents || [],
    }, frequencyMap);

    pushIfValid(feed, {
      key: "thisWeekEvents",
      title: "This Week",
      data: results.thisWeekEventsRes?.data || [],
    }, frequencyMap);

    pushCustomCategory();
    pushPinned();
    /**
     * NEW / CLUBS / PROMOTIONS
     */
    pushIfValid(feed, {
      key: "newlyListedOrganizations",
      title: "New",
      data: results.newlyListedOrganizationsService?.organizations || [],
    }, frequencyMap);

    pushIfValid(feed, {
      key: "loyaltyClubs",
      title: "Loyalty Clubs",
      data: results.suggestedLoyaltyClubsRes?.loyaltyClubs || [],
    }, frequencyMap);



    pushIfValid(feed, {
      key: "promotions",
      title: "Promotions",
      data: results.loyaltyAndGlobalLoyaltyPromotions || [],
    }, frequencyMap);

    pushCustomCategory();
    pushPinned();



    /**
     * HIGHLIGHTS
     */
    pushIfValid(feed, {
      key: "highlights",
      title: "Highlights",
      data: highlights,
    }, frequencyMap);

    pushCustomCategory();
    pushPinned();
    pushCustomCategoryByTags();
    pushPinned();
    pushCustomCategoryByTags();
    pushPinned();
    pushCustomCategoryByTags(true);

    pushPinned(true);

    feed.push({
      key: "globalReferral",
      title: "Global Referral",
      data: getGlobalReferralSettings,
    });
    feed.push({
      key: "configs",
      title: "Configs",
      data: getAppSettings(),
    });
    return { status: true, data: feed };
  } catch (error) {

    return { status: false, data: error || "Error fetching home feed" };
  }
};

const fetchPinnedContentData = async ({
  timezone,
  userLocation,
  radiusKm,
}) => {
  // Home geo bundle already Redis/L1-caches this — skip nested Azure Redis RTT
  const pinnedContent = await findPinnedContentWithFilters(
    { status: "active" },
    { order: 1 }
  );

  if (!pinnedContent.length) return [];

  /* =====================================
     1️⃣ GROUP FILTER IDS
  ===================================== */
  const grouped = {
    eventTags: new Set(),
    eventCategories: new Set(),
    eventVenueTypes: new Set(),
    orgTags: new Set(),
    orgCategories: new Set(),
    orgVenueTypes: new Set(),
  };

  for (const item of pinnedContent) {
    const id = item?.filter?._id?.toString();
    if (!id) continue;

    const key = `${item.filterType}:${item.contentType}`;

    if (key === "Tags:Event") grouped.eventTags.add(id);
    if (key === "Categories:Event") grouped.eventCategories.add(id);
    if (key === "VenueTypes:Event") grouped.eventVenueTypes.add(id);

    if (key === "Tags:Organizations") grouped.orgTags.add(id);
    if (key === "Categories:Organizations") grouped.orgCategories.add(id);
    if (key === "VenueTypes:Organizations") grouped.orgVenueTypes.add(id);
  }

  /* =====================================
     2️⃣ BATCH FETCH (ONLY FEW CALLS)
  ===================================== */
  const [events, organizations] = await Promise.all([
    getEventsBatch({
      ...grouped,
      timezone,
    }),
    getOrganizationsBatch({
      ...grouped,
      timezone,
      userLocation,
      radiusKm,
    }),
  ]);

  /* =====================================
     3️⃣ BUILD LOOKUP MAPS
  ===================================== */
  const maps = buildMaps({ events, organizations });

  /* =====================================
     4️⃣ MAP BACK TO PINNED STRUCTURE
  ===================================== */
  return pinnedContent.map((item) => {
    const id = item.filter._id.toString();
    const key = `${item.filterType}:${item.contentType}`;

    let data = [];

    switch (key) {
      case "Tags:Event":
        data = maps.eventByTag.get(id) || [];
        break;
      case "Categories:Event":
        data = maps.eventByCategory.get(id) || [];
        break;
      case "VenueTypes:Event":
        data = maps.eventByVenueType.get(id) || [];
        break;

      case "Tags:Organizations":
        data = maps.orgByTag.get(id) || [];
        break;
      case "Categories:Organizations":
        data = maps.orgByCategory.get(id) || [];
        break;
      case "VenueTypes:Organizations":
        data = maps.orgByVenueType.get(id) || [];
        break;
    }

    return {
      pinnedId: item._id,
      filterType: item.filterType,
      contentType: item.contentType,
      filter: {
        _id: item.filter._id,
        title: item.filter.title,
      },
      data,
    };
  });
};

/** Standalone pinned fetch (geo-hash key). Prefer geo bundle path in getHome. */
const getPinnedContentForHome = async ({
  timezone,
  userLocation,
  radiusKm,
}) => {
  const cell = resolveGeoCell(userLocation, HOME_GEO_HASH_PRECISION);

  return cacheHomeGeo({
    section: "pinned-content",
    geoHash: cell.hash,
    params: {
      timezone: timezone || "default",
      radiusKm: Number(radiusKm) || 0,
    },
    ttl: Math.max(HOME_GEO_SECTION_TTL, 300),
    fetchFn: () =>
      fetchPinnedContentData({
        timezone,
        userLocation: cell.centerPoint || userLocation,
        radiusKm,
      }),
  });
};

const buildMaps = ({ events, organizations }) => {
  const mapFactory = () => new Map();

  const maps = {
    eventByTag: mapFactory(),
    eventByCategory: mapFactory(),
    eventByVenueType: mapFactory(),
    orgByTag: mapFactory(),
    orgByCategory: mapFactory(),
    orgByVenueType: mapFactory(),
  };

  const toId = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      if (value._id) return String(value._id);
      if (value.id) return String(value.id);
    }
    return String(value);
  };

  const pushMany = (map, values, item) => {
    if (!Array.isArray(values)) return;
    values.forEach((v) => {
      const id = toId(v);
      if (id) push(map, id, item);
    });
  };

  /* EVENTS */
  for (const e of events) {
    pushMany(maps.eventByTag, e?.basicInfo?.tags, e);
    pushMany(maps.eventByCategory, e?.basicInfo?.categories, e);

    // Venue type can come from batch matched ids or populated venue. Support both.
    const matchedVenueTypes = Array.isArray(e?._matchedVenueTypes)
      ? e._matchedVenueTypes
      : [];

    const venueTypesFromVenue = Array.isArray(e?.basicInfo?.venue?.venueType)
      ? e.basicInfo.venue.venueType
      : [];

    pushMany(maps.eventByVenueType, matchedVenueTypes, e);
    pushMany(maps.eventByVenueType, venueTypesFromVenue, e);
  }

  /* ORGS */
  for (const o of organizations) {
    pushMany(maps.orgByTag, o?.otherInfo?.tags, o);
    pushMany(maps.orgByCategory, o?.otherInfo?.categories, o);

    const matchedVenueTypes = Array.isArray(o?._matchedVenueTypes)
      ? o._matchedVenueTypes
      : [];

    const venueTypesFromVenue = Array.isArray(o?.venue?.venueType)
      ? o.venue.venueType
      : [];

    pushMany(maps.orgByVenueType, matchedVenueTypes, o);
    pushMany(maps.orgByVenueType, venueTypesFromVenue, o);
  }

  return maps;
};

const push = (map, key, val) => {
  const k = key.toString();
  if (!map.has(k)) map.set(k, []);
  map.get(k).push(val);
};

module.exports = {
  getHomeService,
  getPinnedContentForHome,
};
