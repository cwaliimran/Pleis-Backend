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
const { getEventsByVenueTypeService, getEventsByTagService, getEventsByCategoryService } = require("../../admin/events/eventService");
const { getOrganizationsByVenueTypeService, getOrganizationsByTagService, getOrganizationByCategoryService } = require("../../admin/organizations/organizationService");

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
    let filter = { quickAction: true }

    const promises = {
      categoriesRes: getPublicCategories(filter),
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
        userId,
      }),

      topPicksOrgs: getTopPicksOrganizationsForHomeService({
        category,
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
        userId,
      }),

      newlyListedOrganizationsService: getNewlyListedOrganizationsService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
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
    const categories = results.categoriesRes?.categories || [];
    const banners = results.bannersRes?.bannerControls || [];
    const getGlobalReferralSettings = results.getGlobalReferralSettingsRes || null;
    const popularEvents = results.popularEventsRes?.data || [];
    const highlights = results.highlightsRes?.highlights || [];
    const customCategories = results.customCategoriesRes?.customCategories || [];
    const tagGroups = results.getOrganizationsGroupedByTagsRes || [];
    const pinnedContent = results.pinnedContentRes || [];
    //save pinnedContent to a file in same folder of json file
    // const fs = require('fs');
    // fs.writeFileSync('./pinnedContent.json', JSON.stringify(pinnedContent, null, 2));

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

        if (!items.length) return; // avoid empty pushes

        pushIfValid(
          feed,
          {
            key: "pinnedContent",
            subKey: p?.contentType,
            id: p?.pinnedId,
            title: p?.filter?.title || "Pinned Content",
            data: items,
          },
          frequencyMap
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
              objects: cat?.objects,
            }, frequencyMap);
          }
        }
      } else {
        const c = customQueue.shift();
        if (!c?.objects?.length) return;

        pushIfValid(feed, {
          key: "customCategory",
          title: c?.title,
          objects: c?.objects,
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
          objects: tg?.data,
        }, frequencyMap);

        return true;
      };

      if (flushAll) {
        while (tagQueue.length) {
          pushOne(tagQueue.shift());
        }
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
      data: results.forYouEvents?.data || [],
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
      data: results.suggestedLoyaltyClubsRes || [],
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
    pushCustomCategoryByTags(true);
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

const getPinnedContentForHome = async ({ timezone, userLocation,
  radiusKm, }) => {
  const normalizedLocation = {
    lat: userLocation?.lat ?? userLocation?.coordinates?.[1] ?? null,
    lng: userLocation?.lng ?? userLocation?.coordinates?.[0] ?? null,
  };

  return cache({
    namespace: "home:pinned-content",
    params: {
      timezone: timezone || "default",
      radiusKm: Number(radiusKm) || 0,
      lat: normalizedLocation.lat,
      lng: normalizedLocation.lng,
    },
    ttl: 300,
    fetchFn: async () => {
      const pinnedContent = await getPinnedContentWithFilters(
        { status: "active" },
        { order: 1 }
      );

      const results = await Promise.all(
        pinnedContent.map(async (item) => {
          if (!item?.filter?._id) return null;

          const handlerKey = `${item.filterType}:${item.contentType}`;
          const handler = filterHandlers[handlerKey];

          if (!handler) return null;

          const id = item.filter._id.toString();

          const response = await handler({
            id,
            timezone,
            userLocation,
            radiusKm,
          });

          // Normalize response shape between events/org services.
          const data = response?.events ?? response ?? [];

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
        })
      );

      return results.filter(Boolean);
    },
  });
};

const filterHandlers = {
  // EVENTS
  "VenueTypes:Event": ({ id, timezone }) =>
    getEventsByVenueTypeService({
      venueTypeId: id,
      timezone,
    }),

  "Tags:Event": ({ id, timezone }) =>
    getEventsByTagService({
      tagId: id,
      timezone,
    }),

  "Categories:Event": ({ id, timezone }) =>
    getEventsByCategoryService({
      categoryId: id,
      timezone,
    }),

  // ORGANIZATIONS (adjust similarly if needed)
  "VenueTypes:Organizations": ({ id, timezone, userLocation,
    radiusKm, }) =>
    getOrganizationsByVenueTypeService({
      venueTypeId: id, timezone, userLocation,
      radiusKm,
    }),

  "Tags:Organizations": ({ id, timezone, userLocation,
    radiusKm, }) =>
    getOrganizationsByTagService({
      tagId: id, timezone, userLocation,
      radiusKm,
    }),

  "Categories:Organizations": ({ id, timezone, userLocation,
    radiusKm, }) =>
    getOrganizationByCategoryService({
      categoryId: id, timezone, userLocation,
      radiusKm,
    }),
};


module.exports = {
  getHomeService,
};
