const {
  sendResponse,
  validateParams,
} = require("../../helperUtils/responseUtil");
const { getOrganizationProfile } = require("./organizationProfileService");


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

module.exports = {
  getOrganizationProfileData,
};
