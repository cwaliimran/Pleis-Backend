const { User } = require("../../models/UserModel"); // Assuming this is the User model path
const moment = require("moment-timezone");
const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  getCurrentDateInTimezone,
  validateParams,
} = require("../../helperUtils/responseUtil");
const { getHomeService } = require("./homeService");

const getHome = async (req, res) => {
  try {
    let { timezone } = req.user
    const { status, data } = await getHomeService({ timezone });

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
