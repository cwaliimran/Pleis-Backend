const { getBannerControls } = require("../../admin/bannerControl/bannerControlsService");
const { getPublicHighlights } = require("../highlights/highlightService");
const { getUserRecentlyViewedItems } = require("../recentlyViewed/recentlyViewedItemService");
const { sendResponse } = require("../../helperUtils/responseUtil");
const { getCustomCategories, transformCustomCategoryObjects } = require("../customCategories/customCategoriesService");
const { getNearbyEvents, getForYouEventsService, thisWeekEvents, getEventsGroupedByTagsService } = require("../events/eventService");
const { getChallenges } = require("../loyalty/challenges/challengesService");
const { getPromotions } = require("../loyalty/promotions/promotionsService");
const { getPublicCategories } = require("../publicCategories/categoriesService");
const { getPopularEventsService, getPopularEventsForHomeService } = require("../popularEvents/popularEventsService");
const {
  getSuggestedLoyaltyClubsForHomeService,
  getNearbyOrganizationsService,
  getNewlyListedOrganizationsService,
  organizationsByVenueTypeService,
  getForYouOrganizationsForHomeService,
  getTrendingOrganizationsForHomeService,
} = require("../organizationProfile/organizationProfileService");
const {
  getRemainingEventsAndUsersRepo,
  getRemainingEventsGroupedByVenueTypesRepo,
  getRemainingOrganizersRepo,
} = require("./homeRepository");
const { getBannerControlsService } = require("./bannerControl/bannerControlsService");
const { getTopPicksOrganizationsForHomeService } = require("../topPicksOrganizations/topPicksOrganizationsService");
const { getLoyaltyAndGlobalLoyaltyPromotions } = require("./promotions/promotionsHomeService");

const getHomeService = async ({ queryData }) => {
  const { userId, userLocation, radiusKm = 50, timezone, category, time } = queryData;

  try {
    // ----------------------------------------------------
    // 1️⃣ FETCH EVERYTHING IN PARALLEL
    // ----------------------------------------------------
// ----------------------------------------------------
// 1️⃣ DEFINE NAMED PROMISES
// ----------------------------------------------------
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

  //new organizations
  newlyListedOrganizationsService: getNewlyListedOrganizationsService({
    category,
    userLocation,
    radiusKm,
    page: 1,
    limit: 10,
  }),
  // nearYouEvents: getNearbyEvents(queryData),

  // organizationsByVenueTypeService: organizationsByVenueTypeService({
  //   location: userLocation.coordinates,
  //   radiusKm,
  //   timezone,
  //   page: 1,
  //   limit: 10,
  //   userId,
  // }),

  // getEventsGroupedByTagsService: getEventsGroupedByTagsService({
  //   location: userLocation.coordinates,
  //   radiusKm,
  //   timezone,
  //   userId,
  // }),

  // customCategoriesRes: getCustomCategories({
  //   userLocation,
  //   userId,
  //   timezone,
  //   page: 1,
  //   limit: 10,
  //   status: "active",
  //   category,
  //   time,
  // }),

  highlightsRes: getPublicHighlights({
    userId,
    page: 1,
    limit: 10,
    userLocation,
    category,
    time,
    timezone,
  }),

  // recentlyViewed: getUserRecentlyViewedItems({
  //   userId,
  //   location: userLocation,
  //   timezone,
  //   targetType: "event",
  //   page: 1,
  //   limit: 10,
  // }),

  // challenges: getChallenges({ page: 1, limit: 10, timezone }),

  // promotions: getPromotions({ page: 1, limit: 10, timezone, category }),

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
  // remainingEventsByVenueTypes: getRemainingEventsGroupedByVenueTypesRepo({
  //   userId,
  //   timezone,
  // }),
};

// ----------------------------------------------------
// 2️⃣ EXECUTE ALL PROMISES SAFELY
// ----------------------------------------------------
const resultsArray = await Promise.all(Object.values(promises));

// ----------------------------------------------------
// 3️⃣ MAP RESULTS BACK TO NAMED OBJECT
// ----------------------------------------------------
const results = Object.fromEntries(
  Object.keys(promises).map((key, index) => [key, resultsArray[index]])
);

// ----------------------------------------------------
// 4️⃣ DESTRUCTURE (ORDER SAFE)
// ----------------------------------------------------
const {
  categoriesRes,
  bannersRes,
  popularEventsRes,
  forYouEvents,
  thisWeekEventsRes,
  topPicksOrgs,
  getForYouOrganizationsService,
  trendingOrganizationsService,
  // nearYouEvents,
  // organizationsByVenueTypeService,
  // getEventsGroupedByTagsService,
  // customCategoriesRes,
  highlightsRes,
  // recentlyViewed,
  // challenges,
  // promotions,
  suggestedLoyaltyClubsRes,
  newlyListedOrganizationsService,
  loyaltyAndGlobalLoyaltyPromotions,
  // remainingEventsByVenueTypes,
} = results;


    // ----------------------------------------------------
    // 2️⃣ NORMALIZE STATIC SOURCES
    // ----------------------------------------------------
    const categories = categoriesRes?.categories || [];
    const banners = bannersRes?.bannerControls || [];
    const popularEvents = popularEventsRes.data || [];
    const highlights = highlightsRes?.highlights || [];
    // const customCategories = customCategoriesRes?.customCategories || [];
    const topPicks = []; // TODO: plug in real "Top Picks" source when available

    const feed = [];

    const push = (section) => {
      if (!section) return;
      // Skip empty array sections
      if (Array.isArray(section.data) && section.data.length === 0) return;
      feed.push(section);
    };

    // ----------------------------------------------------
    // 3️⃣ STATIC HEADER (ORDERED)
    // ----------------------------------------------------
    // Categories
    push({
      key: "categories",
      title: "Categories",
      data: categories,
    });

    //push all banners
    push({
      key: "banners",
      title: "Banners",
      data: banners,
    })


    // Top 10 promos (if any)
    // push({
    //   key: "top10",
    //   title: "Top 10",
    //   data: top10 || [],
    // });
    push({
      key: "popularEvents",
      title: "Popular Events",
      data: popularEvents || [],
    });

    //forYouEvents
    push({
      key: "forYouEvents",
      title: "For You Events",
      data: forYouEvents?.data || [],
    });
    //this week events
    push({
      key: "thisWeekEvents",
      title: "This Week",
      data: thisWeekEventsRes?.data || [],
    });

    //new organizations
    push({
      key: "newlyListedOrganizations",
      title: "New",
      data: newlyListedOrganizationsService.organizations || [],
    });

    // suggestedLoyaltyClubs
    push({
      key: "suggestedLoyaltyClubs",
      title: "Suggested Loyalty Clubs",
      data: suggestedLoyaltyClubsRes || [],
    });
    //loyaltyAndGlobalLoyaltyPromotions
    push({
      key: "loyaltyAndGlobalLoyaltyPromotions",
      title: "Promotions",
      data: loyaltyAndGlobalLoyaltyPromotions || [],
    });

    //for your organizations
    push({
      key: "forYouOrganizations",
      title: "For You Organizations",
      data: getForYouOrganizationsService.organizations || [],
    });

    // // For You – events
    // push({
    //   key: "forYou",
    //   title: "For You",
    //   data: forYou?.data || [],
    // });

    // // Near You – events (optional)
    // if (Array.isArray(nearYouEvents?.events) && nearYouEvents.events.length) {
    //   push({
    //     key: "nearYouEvents",
    //     title: "Near You Events",
    //     data: nearYouEvents.events,
    //   });
    // }

    // // Near You – organizers (from closest)
    // if (
    //   nearYouOrganizations &&
    //   Array.isArray(nearYouOrganizations.organizations) &&
    //   nearYouOrganizations.organizations.length
    // ) {
    //   push({
    //     key: "nearYouOrganizations",
    //     title: "Near You Organizations",
    //     data: nearYouOrganizations, // keep shape { organizations: [...] }
    //   });
    // }

    // // Top Picks (currently empty → will be skipped by push)
    push({
      key: "topPicks",
      title: "Top Picks",
      data: topPicksOrgs.topPicksOrganizations || [],
    });
    // Trending Organizations
    push({
      key: "trendingOrganizations",
      title: "Trending",
      data: trendingOrganizationsService.organizations || [],
    });

    // Highlights
    push({
      key: "highlights",
      title: "Highlights",
      data: highlights,
    });

    // ----------------------------------------------------
    // ✅ DONE
    // ----------------------------------------------------
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
