const { default: mongoose } = require("mongoose");
const {
  sendResponse,
  validateParams,
} = require("../../helperUtils/responseUtil");
const { getHomeService } = require("./homeService");

const getHome = async (req, res) => {

  try {
    const { latitude = 0, longitude = 0, radiusKm = 50000000, } = req.query;
    let { category, time } = req.body;
    if (category) {
      //check if valid mongo id
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_category_id",
        });
      }
    }

    if (time) {
      const validTimes = ["all", "live", "today", "tomorrow", "thisWeek"];
      if (!validTimes.includes(time)) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_time_filter",
        });
      }
    }

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
      category,
      time,
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
