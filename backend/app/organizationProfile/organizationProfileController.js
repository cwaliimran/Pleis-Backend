const {
  sendResponse,
  validateParams,
  parsePaginationParams,
} = require("../../helperUtils/responseUtil");
const { getOrganizationProfile, getNearbyOrganizationsService, joinOrgLoyaltyClub } = require("./organizationProfileService");


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

    let { radiusKm } = req.query;

    const { organizations } = await getNearbyOrganizationsService({
      location: location.coordinates,
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


module.exports = {
  getOrganizationProfileData,
  getNearbyOrganizationsByLocation,
};
