const {
  sendResponse,
  validateParams,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const feedConfigService = require("./feedConfigService");

const getFeedConfig = async (req, res) => {
  try {
    const feedConfig = await feedConfigService.getFeedConfig();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "data_fetched_successfully",
      data: feedConfig,
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

const updateFeedConfig = async (req, res) => {
  if (!validateParams(req, res, { rawData: ["quickAction"] })) return;

  const { quickAction } = req.body;

  if (typeof quickAction !== "boolean") {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_parameters",
      values: { fields: "quickAction" },
    });
  }

  try {
    const updatedFeedConfig = await feedConfigService.updateFeedConfig({
      quickAction,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "admin_settings_3",
      data: updatedFeedConfig,
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
  getFeedConfig,
  updateFeedConfig,
};