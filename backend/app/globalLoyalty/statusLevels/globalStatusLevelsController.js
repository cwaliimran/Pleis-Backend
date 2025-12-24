const {
  sendResponse,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const statusLevelsService = require("./globalStatusLevelsService");


const getStatusLevels = async (req, res) => {
  try {
    const { statusLevels } = await statusLevelsService.getStatusLevels();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "status_levels_fetched_successfully",
      data: statusLevels,
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
  getStatusLevels,
};