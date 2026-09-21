const { User } = require("../../models/UserModel");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
} = require("../../helperUtils/responseUtil");

const { getEvents, getPlaces, getAllData } = require("./mapsService");

const getMapsData = async (req, res) => {
  try {
    const requestData = { ...(req.body || {}) };
    const { page } = parsePaginationParams(req);

    const hasBounds = Boolean(
      requestData.bounds?.northEast && requestData.bounds?.southWest
    );

    // Map viewport: return every pin inside bounds (no pagination).
    // Optional explicit limit still supported for clients that want a cap.
    const bodyLimit = parseInt(req.body?.limit, 10);
    const queryLimit = parseInt(req.query?.limit, 10);
    const explicitLimit = Number.isFinite(bodyLimit) && bodyLimit > 0
      ? bodyLimit
      : Number.isFinite(queryLimit) && queryLimit > 0
        ? queryLimit
        : null;

    const unlimited = hasBounds && explicitLimit == null;
    const limit = unlimited ? null : explicitLimit;

    requestData.page = page;
    requestData.limit = limit;
    requestData.timezone = req.user?.timezone || "Asia/Karachi";
    requestData.userId = req.user?._id;
    requestData.bounds = req.body?.bounds || null;

    requestData.filter = requestData.filter || {};
    const filterType = requestData.filter.type || "events";

    if (
      !validateParams(req, res, {
        enumFields: {
          "filter.type": ["events", "places", "all"],
        },
      })
    )
      return;

    // --------------------------
    // ADVANCE FILTERS (NEW FORMAT)
    // --------------------------
    const af = req.body?.advanceFilters || {};

    const unifiedAdvanceFilters = {
      time: af.time || undefined,
      dateFrom: af.dateFrom || undefined,
      dateTo: af.dateTo || undefined,

      categories: Array.isArray(af.categories) ? af.categories : [],
      venueTypes: Array.isArray(af.venueTypes) ? af.venueTypes : [],
      tags: Array.isArray(af.tags) ? af.tags : [],
      genre: Array.isArray(af.genre) ? af.genre : [],

      distanceFrom: af.distanceFrom ?? 0,
      distanceTo: af.distanceTo ?? 0,
    };

    const baseQuery = {
      page: unlimited ? 1 : page,
      limit,
      unlimited,
      keyword: req.body?.keyword || "",
      sort: af.sort || requestData.sort || "asc",
      timezone: requestData.timezone,
      userId: requestData.userId,
      bounds: requestData.bounds,
      advanceFilters: unifiedAdvanceFilters,
    };

    //
    // EVENTS ONLY
    //
    if (filterType === "events") {
      const { status, result } = await getEvents(baseQuery);

      return sendResponse({
        res,
        statusCode: status ? 200 : 500,
        translationKey: "data_fetched_successfully",
        data: result.data,
        meta: result.meta,
      });
    }

    //
    // PLACES ONLY
    //
    if (filterType === "places") {
      const { status, result } = await getPlaces(baseQuery);

      return sendResponse({
        res,
        statusCode: status ? 200 : 500,
        translationKey: "data_fetched_successfully",
        data: result.data,
        meta: result.meta,
      });
    }

    //
    // ALL
    //
    const { status, result } = await getAllData(baseQuery);

    return sendResponse({
      res,
      statusCode: status ? 200 : 500,
      translationKey: "data_fetched_successfully",
      data: result.data,
    });

  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};


module.exports = {
  getMapsData,
};
