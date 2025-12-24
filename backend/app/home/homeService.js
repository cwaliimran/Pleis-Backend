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

const getHomeService = async ({ queryData }) => {
  const { userId, userLocation, radiusKm = 50, timezone, category } = queryData;

  try {
    /* ===============================
       CONSTANTS
       =============================== */
    const MIN_ITEMS = 2;

    /* ===============================
       1️⃣ DEFINE PROMISES
       =============================== */
    const promises = {
      categoriesRes: getPublicCategories({}),
      bannersRes: getBannerControlsService({ page: 1, limit: 10 }),

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

    /* ===============================
       2️⃣ EXECUTE PROMISES
       =============================== */
    const resultsArray = await Promise.all(Object.values(promises));
    const results = Object.fromEntries(
      Object.keys(promises).map((k, i) => [k, resultsArray[i]])
    );

    /* ===============================
       3️⃣ NORMALIZE RESULTS
       =============================== */
    const categories = results.categoriesRes?.categories || [];
    const banners = results.bannersRes?.bannerControls || [];
    const popularEvents = results.popularEventsRes?.data || [];
    const highlights = results.highlightsRes?.highlights || [];
    const customCategories = results.customCategoriesRes?.customCategories || [];
    const tagGroups = results.getOrganizationsGroupedByTagsRes || [];

    const feed = [];

    /* ===============================
       4️⃣ SAFE PUSH (MIN ITEMS RULE)
       =============================== */
    const pushIfValid = (section) => {
      if (!section) return;

      if (Array.isArray(section.data) && section.data.length < MIN_ITEMS) return;
      if (Array.isArray(section.objects) && section.objects.length < MIN_ITEMS) return;

      feed.push(section);
    };

    /* ===============================
       5️⃣ FIXED HEADER
       =============================== */
    pushIfValid({ key: "categories", title: "Categories", data: categories });
    pushIfValid({ key: "banners", title: "Banners", data: banners });

    /* ===============================
       6️⃣ ORGANIZATIONS
       =============================== */
    pushIfValid({
      key: "forYouOrganizations",
      title: "For You",
      data: results.getForYouOrganizationsService?.organizations || [],
    });

    pushIfValid({
      key: "nearYouOrganizations",
      title: "Near You",
      data: results.nearYouOrganizationsRes?.organizations || [],
    });

    pushIfValid({
      key: "topPicks",
      title: "Top Picks",
      data: results.topPicksOrgs?.topPicksOrganizations || [],
    });

    pushIfValid({
      key: "trendingOrganizations",
      title: "Trending",
      data: results.trendingOrganizationsService?.organizations || [],
    });

    pushIfValid({
      key: "reservations",
      title: "Make a Reservation",
      data: results.getOrganizationsWithReservationsRes || [],
    });

    /* ===============================
       7️⃣ EVENTS
       =============================== */
    pushIfValid({ key: "popularEvents", title: "Popular Events", data: popularEvents });
    pushIfValid({ key: "forYouEvents", title: "For You Events", data: results.forYouEvents?.data || [] });
    pushIfValid({ key: "thisWeekEvents", title: "This Week", data: results.thisWeekEventsRes?.data || [] });

    /* ===============================
       8️⃣ NEW / LOYALTY / PROMO
       =============================== */
    pushIfValid({
      key: "newlyListedOrganizations",
      title: "New",
      data: results.newlyListedOrganizationsService?.organizations || [],
    });

    pushIfValid({
      key: "loyaltyClubs",
      title: "Loyalty Clubs",
      data: results.suggestedLoyaltyClubsRes || [],
    });

    pushIfValid({
      key: "promotions",
      title: "Promotions",
      data: results.loyaltyAndGlobalLoyaltyPromotions || [],
    });

    /* ===============================
       9️⃣ QUEUES (NO MUTATION)
       =============================== */
    const customQueue = [...customCategories];
    const tagQueue = [...tagGroups];

    /* ===============================
       🔟 FIRST CUSTOM CATEGORY
       =============================== */
    if (customQueue.length) {
      const c = customQueue.shift();
      pushIfValid({
        key: "customCategory",
        title: c?.title,
        objects: c?.objects,
      });
    }

    /* ===============================
       1️⃣1️⃣ FIRST 3 MIXED (CUSTOM + TAG)
       =============================== */
    let mixedCount = 0;

    while (mixedCount < 3 && (customQueue.length || tagQueue.length)) {
      let pushed = false;

      if (customQueue.length) {
        const c = customQueue.shift();
        if (c?.objects?.length >= MIN_ITEMS) {
          feed.push({
            key: "customCategory",
            title: c.title,
            objects: c.objects,
          });
          mixedCount++;
          pushed = true;
        }
      }

      if (!pushed && tagQueue.length) {
        const t = tagQueue.shift();
        if (t?.data?.length >= MIN_ITEMS) {
          feed.push({
            key: "customCategoryByTags",
            title: t.title,
            objects: t.data,
          });
          mixedCount++;
        }
      }
    }

    /* ===============================
       1️⃣2️⃣ HIGHLIGHTS
       =============================== */
    pushIfValid({
      key: "highlights",
      title: "Highlights",
      data: highlights,
    });

    /* ===============================
       1️⃣3️⃣ REST OF CUSTOM CATEGORIES
       =============================== */
    while (customQueue.length) {
      const c = customQueue.shift();
      pushIfValid({
        key: "customCategory",
        title: c?.title,
        objects: c?.objects,
      });
    }

    /* ===============================
       1️⃣4️⃣ REST OF TAG GROUPS
       =============================== */
    while (tagQueue.length) {
      const t = tagQueue.shift();
      pushIfValid({
        key: "customCategoryByTags",
        title: t?.title,
        objects: t?.data,
      });
    }

    /* ===============================
       ✅ DONE
       =============================== */
    return { status: true, data: feed };
  } catch (error) {
    return sendResponse({
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};


module.exports = {
  getHomeService,
};
