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
  getSuggestedLoyaltyClubs,
  getNearbyOrganizationsService,
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

const getHomeService = async ({ queryData }) => {
  const { userId, userLocation, radiusKm = 50, timezone, category, time } = queryData;

  try {
    // ----------------------------------------------------
    // 1️⃣ FETCH EVERYTHING IN PARALLEL
    // ----------------------------------------------------
    const [
      categoriesRes,
      bannersRes,
      popularEventsRes,
      forYouEvents,
      thisWeekEventsRes,
      topPicksOrgs,
      getForYouOrganizationsService,
      trendingOrganizationsService,
      // nearYouEvents,
      nearYouOrganizations,
      // venueTypesRaw,
      // tagGroupsRaw,
      // customCategoriesRes,
      highlightsRes,
      // recentlyViewed,
      // challenges,
      // promotions,
      suggestedLoyaltyClubs,
      // remainingEventsByVenueTypes,
    ] = await Promise.all([
      getPublicCategories({}),
      getBannerControlsService({ page: 1, limit: 10, }),
      getPopularEventsForHomeService({ limit: 10, skip: 0, timezone, category, userLocation, radiusKm }),
      getForYouEventsService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        userId,
      }),
      thisWeekEvents({ timezone, category, userLocation, radiusKm, page: 1, limit: 10, userId }),
      getTopPicksOrganizationsForHomeService({ category, limit: 10, skip: 0, userLocation, radiusKm, }),
      getTrendingOrganizationsForHomeService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        userId,
      }),
      getForYouOrganizationsForHomeService({
        category,
        userLocation,
        radiusKm,
        timezone,
        page: 1,
        limit: 10,
        skip: 0,
        userId,
      }),
      // getNearbyEvents(queryData),

      // organizationsByVenueTypeService({
      //   location: userLocation.coordinates,
      //   radiusKm,
      //   timezone,
      //   page: 1,
      //   limit: 10,
      //   userId,
      // }),
      // getEventsGroupedByTagsService({
      //   location: userLocation.coordinates,
      //   radiusKm,
      //   timezone,
      //   userId,
      // }),
      // getCustomCategories({
      //   userLocation,
      //   userId,
      //   timezone,
      //   page: 1,
      //   limit: 10,
      //   status: "active",
      //   category,
      //   time,
      // }),
      getPublicHighlights({
        userId,
        page: 1,
        limit: 10,
        userLocation,
        category,
        time,
        timezone,
      }),
      // getUserRecentlyViewedItems({
      //   userId,
      //   location: userLocation,
      //   timezone,
      //   targetType: "event",
      //   page: 1,
      //   limit: 10,
      // }),
      // [],//getChallenges({ page: 1, limit: 10, timezone }),
      // getPromotions({ page: 1, limit: 10, timezone, category }),
      getSuggestedLoyaltyClubs({ page: 1, limit: 10, userId }),
      // getRemainingEventsGroupedByVenueTypesRepo({ userId, timezone }),
    ]);

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
    // suggestedLoyaltyClubs
    push({
      key: "suggestedLoyaltyClubs",
      title: "Suggested Loyalty Clubs",
      data: suggestedLoyaltyClubs || [],
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
    if (
      nearYouOrganizations &&
      Array.isArray(nearYouOrganizations.organizations) &&
      nearYouOrganizations.organizations.length
    ) {
      push({
        key: "nearYouOrganizations",
        title: "Near You Organizations",
        data: nearYouOrganizations, // keep shape { organizations: [...] }
      });
    }

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
