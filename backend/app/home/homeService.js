const { getPublicHighlights } = require("../highlights/highlightService");
const { sendResponse } = require("../../helperUtils/responseUtil");
const { getCustomCategories } = require("../customCategories/customCategoriesService");
const { getForYouEventsService, thisWeekEvents } = require("../events/eventService");
const { getPublicCategories } = require("../publicCategories/categoriesService");
const { getPopularEventsForHomeService } = require("../popularEvents/popularEventsService");

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
    const promises = {
      categoriesRes: getPublicCategories({}),
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

    /**
     * HANDLE CUSTOM + TAG MIX
     */
    const customQueue = [...customCategories];
    const tagQueue = [...tagGroups];

    if (customQueue.length) {
      const c = customQueue.shift();
      pushIfValid(feed, {
        key: "customCategory",
        title: c?.title,
        objects: c?.objects,
      }, frequencyMap);
    }

    let mixedCount = 0;

    while (mixedCount < 3 && (customQueue.length || tagQueue.length)) {
      let pushed = false;

      if (customQueue.length) {
        const c = customQueue.shift();
        const before = feed.length;

        pushIfValid(feed, {
          key: "customCategory",
          title: c?.title,
          objects: c?.objects,
        }, frequencyMap);

        if (feed.length > before) {
          mixedCount++;
          pushed = true;
        }
      }

      if (!pushed && tagQueue.length) {
        const t = tagQueue.shift();
        const before = feed.length;

        pushIfValid(feed, {
          key: "customCategoryByTags",
          title: t?.title,
          objects: t?.data,
        }, frequencyMap);

        if (feed.length > before) {
          mixedCount++;
        }
      }
    }

    /**
     * HIGHLIGHTS
     */
    pushIfValid(feed, {
      key: "highlights",
      title: "Highlights",
      data: highlights,
    }, frequencyMap);

    /**
     * REST OF CUSTOM + TAGS
     */
    while (customQueue.length) {
      const c = customQueue.shift();
      pushIfValid(feed, {
        key: "customCategory",
        title: c?.title,
        objects: c?.objects,
      }, frequencyMap);
    }

    while (tagQueue.length) {
      const t = tagQueue.shift();
      pushIfValid(feed, {
        key: "customCategoryByTags",
        title: t?.title,
        objects: t?.data,
      }, frequencyMap);
    }

    feed.push({
      key: "globalReferral",
      title: "Global Referral",
      data: getGlobalReferralSettings,
    });
    return { status: true, data: feed };
  } catch (error) {
    console.log("error===>", error)
    return { status: false, data: error.message || "Error fetching home feed" };
  }
};




module.exports = {
  getHomeService,
};
