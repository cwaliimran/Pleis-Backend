const {
  sendResponse,
} = require("../../helperUtils/responseUtil");
const { getHomeService } = require("./homeService");

const getHome = async (req, res) => {

  try {
    const { latitude = 0, longitude = 0, radiusKm = 150 } = req.query;
    let { location: userLocation, timezone, _id: userId } = req.user;

    if (latitude && longitude) {
      userLocation = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    let queryData = {
      userLocation,
      userId,
      timezone: timezone || "Asia/Karachi",
      radiusKm: parseFloat(radiusKm),
    };

    const { status, data } = await getHomeService({ queryData });

    if (status === false) {
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
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error: error,
    });
  }
};

module.exports = {
  getHome,
};
