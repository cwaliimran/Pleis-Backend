const { getPublicHighlights } = require("../highlights/highlightService");
const { sendResponse } = require("../../helperUtils/responseUtil");
const { getCustomCategories } = require("../customCategories/customCategoriesService");
const { getForYouEventsService, thisWeekEvents } = require("../events/eventService");
const { getPublicCategories } = require("../publicCategories/categoriesService");
const { getPopularEventsForHomeService } = require("../popularEvents/popularEventsService");
const { cache, invalidate } = require("@redisCache");

const {
  getSuggestedLoyaltyClubsForHomeService,
  getNearbyOrganizationsService,
  getNewlyListedOrganizationsService,
  getForYouOrganizationsForHomeService,
  getTrendingOrganizationsForHomeService,
  getOrganizationsGroupedByTagsService,
} = require("../organizationProfile/organizationProfileService");

const { getBannerControlsService } = require("./bannerControl/bannerControlsService");
const { getTopPicksOrganizationsForHomeService } = require("../topPicksOrganizations/topPicksOrganizationsService");
const { getLoyaltyAndGlobalLoyaltyPromotions } = require("./promotions/promotionsHomeService");
const { getOrganizationsWithReservationsForHomeService } = require("../reservations/reservationService");

const { pushIfValid } = require("./utils/feedPushRules");
const { getGlobalReferralSettingsRepository } = require("../../admin/globalLoyalty/globalReferral/globalReferralRepository");
const { getAppSettings } = require("../appSettings/appSettingsController");
const { getPinnedContentWithFilters } = require("../../admin/pinnedContent/pinnedContentRepository");
const { getEventsByVenueTypeService, getEventsByTagService, getEventsByCategoryService, getEventsBatch } = require("../../admin/events/eventService");
const { getOrganizationsByVenueTypeService, getOrganizationsByTagService, getOrganizationByCategoryService, getOrganizationsBatch } = require("../../admin/organizations/organizationService");
const { findOrCreateFeedConfig } = require("../../admin/feedConfig/feedConfigRepository");

const getHomeService = async ({ queryData }) => {
  const { userId, userLocation, radiusKm = 50, timezone, category } = queryData;

  try {
    /**
     * GLOBAL frequency limits
     */
    const frequencyMap = {
      orgs: new Map(),
      events: new Map(),
    };

    /**
     * PROMISES
     */

    //fist check if getFeedConfig has quickAction enabled, if not then return empty array

    const feedConfig = await findOrCreateFeedConfig();



    const promises = {
      ...(feedConfig?.quickAction && {
        categoriesRes: getPublicCategories({
          status: "active",
        }),
      }),
      bannersRes: getBannerControlsService({ page: 1, limit: 10 }),
      getGlobalReferralSettingsRes: getGlobalReferralSettingsRepository(),

      popularEventsRes: getPopularEventsForHomeService({
        limit: 10,
        skip: 0,
        timezone,
        category,
        userLocation,
        radiusKm,
      }),

      forYouEvents: getForYouEventsService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        userId,
      }),

      thisWeekEventsRes: thisWeekEvents({
        timezone,
        category,
        userLocation,
        radiusKm,
        page: 1,
        limit: 10,
        skip: 0,
        userId,
      }),

      topPicksOrgs: getTopPicksOrganizationsForHomeService({
        category,
        page: 1,
        limit: 10,
        skip: 0,
        userLocation,
        radiusKm,
      }),

      trendingOrganizationsService: getTrendingOrganizationsForHomeService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        skip: 0,
        userId,
      }),

      getOrganizationsWithReservationsRes: getOrganizationsWithReservationsForHomeService({
        userId,
        userLocation,
        radiusKm,
        timezone,
        category,
      }),

      getForYouOrganizationsService: getForYouOrganizationsForHomeService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        skip: 0,
        userId,
      }),

      nearYouOrganizationsRes: getNearbyOrganizationsService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        skip: 0,
        userId,
      }),

      newlyListedOrganizationsService: getNewlyListedOrganizationsService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        skip: 0,
        userId,
      }),

      customCategoriesRes: getCustomCategories({
        userLocation,
        userId,
        timezone,
        page: 1,
        limit: 10,
        status: "active",
        category,
      }),

      highlightsRes: getPublicHighlights({
        userId,
        page: 1,
        limit: 10,
        userLocation,
        radiusKm,
        category,
        timezone,
      }),

      suggestedLoyaltyClubsRes: getSuggestedLoyaltyClubsForHomeService({
        page: 1,
        limit: 10,
        skip: 0,
        userId,
        userLocation,
        radiusKm,
      }),

      loyaltyAndGlobalLoyaltyPromotions: getLoyaltyAndGlobalLoyaltyPromotions({
        page: 1,
        limit: 5,
        userId,
        timezone,
      }),

      getOrganizationsGroupedByTagsRes: getOrganizationsGroupedByTagsService({
        userLocation,
        radiusKm,
        timezone,
        userId,
        category,
      }),
      pinnedContentRes: getPinnedContentForHome({
        timezone,
        userLocation,
        radiusKm,
      }),
    };

    const resultsArray = await Promise.all(Object.values(promises));
    const results = Object.fromEntries(
      Object.keys(promises).map((k, i) => [k, resultsArray[i]])
    );

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

const round = (num) => (num != null ? Math.round(num * 100) / 100 : null);

const getPinnedContentForHome = async ({
  timezone,
  userLocation,
  radiusKm,
}) => {
  const normalizedLocation = {
    lat: userLocation?.lat ?? userLocation?.coordinates?.[1] ?? null,
    lng: userLocation?.lng ?? userLocation?.coordinates?.[0] ?? null,
  };

  return cache({
    namespace: "home:pinned-content", // bump version
    params: {
      timezone: timezone || "default",
      radiusKm: Number(radiusKm) || 0,
      lat: round(normalizedLocation.lat), // 🔥 better cache hits
      lng: round(normalizedLocation.lng),
    },
    ttl: 3600,
    fetchFn: async () => {
      const pinnedContent = await getPinnedContentWithFilters(
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
      const [
        events,
        organizations,
      ] = await Promise.all([
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
      const results = pinnedContent.map((item) => {
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
          data: data
        };
      });

      return results;
    },
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
};
