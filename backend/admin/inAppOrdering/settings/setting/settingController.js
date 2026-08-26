const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../../helperUtils/responseUtil");

const Setttingservice = require("./settingService");

const getSetttings = async (req, res) => {
  const { organization } = req.query;
  try {
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_required",
      });
    }

    const SetttingsData = await Setttingservice.getSetttings({
      organization
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Setttings_fetched_successfully",
      data: SetttingsData,
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
const updateSetttings = async (req, res) => {
  let {
    paymentMethod,
    organization,
    companyOrganizer,
    automaticOrderAcceptance,
  } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;
  if(req.user.userType === "organizer") {
    companyOrganizer = req.user._id;
  }

  let data = {
    paymentMethod,
    automaticOrderAcceptance,
    organization,
    companyOrganizer
  };

  try {
    const updated = await Setttingservice.updateSetttings(organization, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Setttings_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Setttings_updated_successfully",
      data: updated,
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
  getSetttings,
  updateSetttings,
};
