const {
  sendResponse,
  validateParams,
  parsePaginationParams,
} = require("../../helperUtils/responseUtil");
const { getOrganizationProfile, getNearbyOrganizationsService, joinOrgLoyaltyClub, getForYouOrganizationsForHomeService, getTrendingOrganizationsForHomeService } = require("./organizationProfileService");


const getOrganizationProfileData = async (req, res) => {

  const { _id } = req.user;

  try {
    if (!validateParams(req, res, {
      objectIdFields: ["organizationId"]
    })) return;

    var organizationId = req.params.organizationId;

    let { timezone, location } = req.user;
    let { filter } = req.query;

    let status = true;
    let result = {};
    ({ status, result } = await getOrganizationProfile({ organizationId, timezone, userLocation: location, userId: _id, filter }));

    if (status === false) {
      return sendResponse({
        res,
        statusCode: 500,
        translationKey: "internal_server_error",
        error: result,
      });
    }



    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "data_fetched_successfully",
      data: result.data,
      meta: result.meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

const getNearbyOrganizationsByLocation = async (req, res) => {
  try {
    let { timezone, location } = req.user;
    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "user_location_not_provided",
      });
    }

    let { page, limit } = parsePaginationParams(req);
    let { category } = req.body;

    let { radiusKm } = req.query;

    const { organizations } = await getNearbyOrganizationsService({
      category,
      userLocation: { type: "Point", coordinates: location.coordinates },
      radiusKm: radiusKm || 1,
      timezone,
      page,
      limit,
      userId: req.user._id
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "nearby_organizations_fetched_successfully",
      data: organizations,
      // meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error,
    });
  }
};

const getForYouOrganizations = async (req, res) => {
  try {
    const { latitude = 0, longitude = 0, radiusKm = 50, } = req.query;

    let { location: userLocation, timezone, _id: userId } = req.user;

    if (latitude && longitude) {
      userLocation = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    let { page, limit } = parsePaginationParams(req);
    let { category } = req.body;


    const { organizations } = await getForYouOrganizationsForHomeService({
      category,
      userLocation,
      radiusKm: radiusKm || 1,
      timezone,
      page,
      limit,
      userId
    });


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "for_you_organizations_fetched_successfully",
      data: organizations,
      // meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error,
    });
  }
};


const getTrendingOrganizationsForHome = async (req, res) => {
  try {
    const { latitude = 0, longitude = 0, radiusKm = 50, } = req.query;

    let { location: userLocation, timezone, _id: userId } = req.user;

    if (latitude && longitude) {
      userLocation = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    let { page, limit } = parsePaginationParams(req);
    let { category } = req.body;
    const { organizations } = await getTrendingOrganizationsForHomeService({
      category,
      userLocation,
      radiusKm,
      timezone,
      page,
      limit,
      userId
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "trending_organizations_fetched_successfully",
      data: organizations,
      // meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error,
    });
  }
}

module.exports = {
  getOrganizationProfileData,
  getNearbyOrganizationsByLocation,
  getForYouOrganizations,
  getTrendingOrganizationsForHome
};
