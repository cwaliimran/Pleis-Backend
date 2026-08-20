const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");

const ReservationTypeService = require("./reservationTypeService");

const createReservationType = async (req, res) => {
  let {
    companyOrganizer,
    organization,
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
    minimumSpend,
  } = req.body;

  const user = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: [
        "companyOrganizer",
        "organization",
        "name",
        "numberOfTables",
        "maxCapacity",
        "maxPartySize",
        "conditionType",
        "bonosPoints",
        "isVisibleToGuest",
        "requireConfirmationToApprove",
        "occasionRequired",
        "tax",
        "status",
      ],
    })
  )
    return;
  let data = {
    companyOrganizer,
    organization,
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
    minimumSpend,
  };
  try {
    const ReservationTypeData =
      await ReservationTypeService.createReservationType(data);
    if (!ReservationTypeData) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "ReservationType_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "ReservationType_created_successfully",
      data: ReservationTypeData,
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
const getReservationTypes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { conditionType, status, summary, organization } = req.query;
  try {
      if(!organization){
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "organization_required",
        });
      }
    const user = req.user._id;
    const timezone = req.user.timezone;
    const { ReservationTypes, meta } =
      await ReservationTypeService.getReservationTypes({
        timezone,
        page,
        limit,
        status,
        summary,
        organization,
        conditionType
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReservationTypes_fetched_successfully",
      data: ReservationTypes,
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
const updateReservationType = async (req, res) => {
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
    minimumSpend,
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
    minimumSpend
  };

  try {
    const updated = await ReservationTypeService.updateReservationType(
      id,
      data,
    );
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
        translationKey: "ReservationType_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReservationType_updated_successfully",
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

const deleteReservationType = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await ReservationTypeService.deleteReservationType(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "ReservationType_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ReservationType_deleted_successfully",
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
  createReservationType,
  getReservationTypes,
  updateReservationType,
  deleteReservationType,
};
