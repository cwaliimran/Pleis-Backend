const { default: mongoose } = require("mongoose");
const {
  sendResponse,
  validateParams,
  parsePaginationParams,
  generateMeta
} = require("../../helperUtils/responseUtil");
const { getHomeService } = require("./homeService");
const { globalSearchService, getGlobalFiltersService } = require("./globalSearch/globalSearchService");
const { getForYouOrganizationsForHomeService, getNearbyOrganizationsService, getTrendingOrganizationsForHomeService, getNewlyListedOrganizationsService, getSuggestedLoyaltyClubsForHomeService } = require("../organizationProfile/organizationProfileService");
const { getTopPicksOrganizationsForHomeService } = require("../topPicksOrganizations/topPicksOrganizationsService");
const { getForYouEventsService, thisWeekEvents } = require("../events/eventService");

const getHome = async (req, res) => {

  try {
    let { category } = req.body;
    // Validate category once
    if (category && !mongoose.Types.ObjectId.isValid(category)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_category_id",
      });
    }
    const { latitude, longitude, radiusKm = 50 } = req.query;
    const { location: savedLocation, timezone, _id: userId } = req.user;

    let userLocation = null;

    // 1️⃣ If query params exist → ALWAYS use them
    if (latitude !== undefined && longitude !== undefined) {
      const lng = parseFloat(longitude);
      const lat = parseFloat(latitude);

      // 0,0 means GLOBAL
      if (lng === 0 && lat === 0) {
        userLocation = null;
      } else {
        userLocation = {
          type: "Point",
          coordinates: [lng, lat],
        };
      }
    }
    // 2️⃣ Otherwise fallback to saved user location
    else if (savedLocation?.coordinates?.length === 2) {
      const [lng, lat] = savedLocation.coordinates;

      if (lng === 0 && lat === 0) {
        userLocation = null;        // Global again
      } else {
        userLocation = {
          type: "Point",
          coordinates: savedLocation.coordinates,
        };
      }
    }
    let queryData = {
      userLocation,
      userId,
      timezone: timezone || "Asia/Karachi",
      radiusKm: parseFloat(radiusKm),
      category,
    };

    const { status, data } = await getHomeService({ queryData });

    if (status === false) {
      console.log("Error fetching home==>", data)
      return sendResponse({
        res,
        statusCode: 500,
        translationKey: "internal_server_error",
        error: data,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "data_fetched_successfully",
      data,
    });
  } catch (error) {
    console.log("error==>", error)
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

const globalSearch = async (req, res) => {
  //filterKey is used to filter data when user requests from search section in home screen, it can have values like events, organizations, giveaways, etc. which will be used in service layer to filter data accordingly.
  //filterKey is actually represents a section
  const { latitude, longitude, keyword, type, filterKey } = req.query;
  const { page, limit, skip } = parsePaginationParams(req);
  let { timezone, _id: userId } = req.user || {};
  let { sort = "desc" } = req.body || {};
  const ctx = {
    keyword,
    filterKey,
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    page,
    limit,
    timezone,
    userId,
    type: type || "all",
    sort,
    advanceFilters: req.body?.advanceFilters || {},
  };

  try {

    if (filterKey) {

      if (filterKey === "forYouOrganizations") {
        const { userId, timezone, latitude, longitude, advanceFilters } = ctx;
        const { organizations, totalCount } = await getForYouOrganizationsForHomeService({
          category: advanceFilters?.categories,
          userLocation: latitude && longitude ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : null,
          radiusKm: ctx.radiusKm || 50,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx
        });

        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "search_results_fetched",
          data: organizations,
          meta: generateMeta(page, limit, totalCount)
        });
      }

      if (filterKey === "nearYouOrganizations") {
        const { userId, timezone, latitude, longitude, advanceFilters } = ctx;
        const { organizations, totalCount } = await getNearbyOrganizationsService({
          category: advanceFilters?.categories,
          userLocation: latitude && longitude ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : null,
          radiusKm: ctx.radiusKm || 50,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx
        });

        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "search_results_fetched",
          data: organizations,
          meta: generateMeta(page, limit, totalCount)
        });
      }
      if (filterKey === "topPicks") { //topPicks is a section in home screen which shows top picks organizations based on user's interest and location
        const { userId, timezone, latitude, longitude, advanceFilters } = ctx;
        const { topPicksOrganizations, totalCount } = await getTopPicksOrganizationsForHomeService({
          category: advanceFilters?.categories,
          userLocation: latitude && longitude ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : null,
          radiusKm: ctx.radiusKm || 50,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx
        });

        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "search_results_fetched",
          data: topPicksOrganizations,
          meta: generateMeta(page, limit, totalCount)
        });
      }
      if (filterKey === "trendingOrganizations") {
        const { userId, timezone, latitude, longitude, advanceFilters } = ctx;
        const { organizations, totalCount } = await getTrendingOrganizationsForHomeService({
          category: advanceFilters?.categories,
          userLocation: latitude && longitude ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : null,
          radiusKm: ctx.radiusKm || 50,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx
        });

        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "search_results_fetched",
          data: organizations,
          meta: generateMeta(page, limit, totalCount)
        });
      }
      if (filterKey === "forYouEvents") {
        const { userId, timezone, latitude, longitude, advanceFilters } = ctx;
        const { recommendedEvents, totalCount } = await getForYouEventsService({
          category: advanceFilters?.categories,
          userLocation: latitude && longitude ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : null,
          radiusKm: ctx.radiusKm || 50,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx
        });

        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "search_results_fetched",
          data: recommendedEvents,
          meta: generateMeta(page, limit, totalCount)
        });
      }
      if (filterKey === "thisWeekEvents") {
        const { userId, timezone, latitude, longitude, advanceFilters } = ctx;
        const { data, totalCount } = await thisWeekEvents({
          category: advanceFilters?.categories,
          userLocation: latitude && longitude ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : null,
          radiusKm: ctx.radiusKm || 50,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx
        });

        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "search_results_fetched",
          data,
          meta: generateMeta(page, limit, totalCount)
        });
      }
      if (filterKey === "newlyListedOrganizations") {
        const { userId, timezone, latitude, longitude, advanceFilters } = ctx;
        const { organizations, totalCount } = await getNewlyListedOrganizationsService({
          category: advanceFilters?.categories,
          userLocation: latitude && longitude ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : null,
          radiusKm: ctx.radiusKm || 50,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx
        });

        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "search_results_fetched",
          data: organizations,
          meta: generateMeta(page, limit, totalCount)
        });
      }
      if (filterKey === "loyaltyClubs") {
        const { userId, timezone, latitude, longitude, advanceFilters } = ctx;
        const { loyaltyClubs, totalCount } = await getSuggestedLoyaltyClubsForHomeService({
          userLocation: latitude && longitude ? {
            type: "Point",
            coordinates: [longitude, latitude]
          } : null,
          radiusKm: ctx.radiusKm || 50,
          timezone,
          page,
          limit,
          skip,
          userId,
          ctx
        });

        return sendResponse({
          res,
          statusCode: 200,
          translationKey: "search_results_fetched",
          data: loyaltyClubs,
          meta: generateMeta(page, limit, totalCount)
        });
      }


    } else {
      const sections = await globalSearchService(ctx);

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "search_results_fetched",
        data: sections,
      });
    }

  } catch (err) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: err,
    });
  }
};


const globalFilters = async (req, res) => {
  try {
    const { _id: userId, timezone } = req.user || {};
    let { latitude = 0, longitude = 0, radiusKm = 50 } = req.query;
    let { categories: categoriesFilter = [] } = req.body || {};
    const center = {
      type: "Point",
      coordinates: [Number(longitude), Number(latitude)]
    };
    const filters = await getGlobalFiltersService(userId, timezone, center, radiusKm, categoriesFilter);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "global_filters_fetched_successfully",
      data: filters,
    });
  }
  catch (err) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: err,
    });
  }
};

module.exports = {
  getHome,
  globalSearch,
  globalFilters
};
