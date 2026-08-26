const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const Occasionervice = require("./occasionService");

const createOccasion = async (req, res) => {
  let { companyOrganizer, organization, name, status = "active" } = req.body;
  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id;
  }

  if (
    !validateParams(req, res, {
      rawData: ["organization", "name"],
    })
  )
    return;
  let data = {
    companyOrganizer,
    organization,
    name,
    status,
  };
  try {
    const OccasionData = await Occasionervice.createOccasion(data);
    if (!OccasionData) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Occasion_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Occasion_created_successfully",
      data: OccasionData,
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
const getOccasion = async (req, res) => {
  const { organization } = req.query;
  try {
    if (!organization) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organization_required",
      });
    }
    const user = req.user._id;
    const occasion = await Occasionervice.getOccasion({
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Occasion_fetched_successfully",
      data: occasion,
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
const updateOccasion = async (req, res) => {
  const { id } = req.params;
  let {
    name,
    description,
    numberOfTables,
    maxCapacity,
    maxPartySize,
    conditionType,
    bonosPoints,
    isVisibleToGuest,
    notes,
    requireConfirmationToApprove,
    occasionRequired,
    tax,
    status,
  } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  let data = {
    name,
    description,
    numberOfTables,
    maxCapacity,
    maxPartySize,
    conditionType,
    bonosPoints,
    isVisibleToGuest,
    notes,
    requireConfirmationToApprove,
    occasionRequired,
    tax,
    status,
  };

  try {
    const updated = await Occasionervice.updateOccasion(id, data);
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
        translationKey: "Occasion_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Occasion_updated_successfully",
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

const deleteOccasion = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await Occasionervice.deleteOccasion(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Occasion_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Occasion_deleted_successfully",
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
  createOccasion,
  getOccasion,
  updateOccasion,
  deleteOccasion,
};
