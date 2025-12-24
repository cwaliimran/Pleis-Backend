const {
  sendResponse,
  parsePaginationParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const topPicksOrganizationsService = require("./topPicksOrganizationsService");

const getTopPicksOrganizations = async (req, res) => {
  const { page, limit, skip } = parsePaginationParams(req);
  const { latitude = 0, longitude = 0, radiusKm = 50, } = req.query;
      let { category } = req.body;


  try {


    let { location: userLocation} = req.user;


    if (latitude && longitude) {
      userLocation = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    const { topPicksOrganizations, meta } = await topPicksOrganizationsService.getTopPicksOrganizations({
      category,
      page,
      limit,
      skip,
      userLocation,
      radiusKm,
    });


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "top_picks_organizations_fetched_successfully",
      data: topPicksOrganizations,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = {
  getTopPicksOrganizations,
};