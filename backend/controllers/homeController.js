const { User } = require("../models/UserModel"); // Assuming this is the User model path
const moment = require("moment-timezone");
const {
  sendResponse,
  parsePaginationParams,
  generateMeta,
  getCurrentDateInTimezone,
  validateParams,
} = require("../helperUtils/responseUtil");

const getHome = async (req, res) => {
  try {
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Welcome to Pleis API",
      data: "Welcome to Pleis API",
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
