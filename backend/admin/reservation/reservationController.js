const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");

const reservationService = require("./reservationService");

const createReservation = async (req, res) => {
const {
  title,
  availableReservations,
  maxCapacityPerReservation,
  conditionType,
amount,
  ticketType,
  customText,
  taxPercentage,
  needsConfirmation,
  optionalEventId,
  status,
  organizationId
} = req.body;
const userId = req.user._id;
if (
  !validateParams(req, res, {
    rawData: [
      "title", 
      "availableReservations", 
      "maxCapacityPerReservation",
      "conditionType", 
      "taxPercentage",
      "needsConfirmation",
      "status",
      "organizationId",
      "amount"

    ],
  })
) return;

  let data = {
    userId,
title,
  availableReservations,
  maxCapacityPerReservation,
  conditionType,
  amount,
  ticketType,
  customText,
  taxPercentage,
  needsConfirmation,
  optionalEventId,
  status,
  organizationId,
  };
  try {
    const Reservation = await reservationService.createReservation(data);
    if (!Reservation) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Reservation_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Reservation_created_successfully",
      data: Reservation,
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

const getReservations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range ,organizationsId} = req.query;
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { reservations, meta } = await reservationService.getReservations({
        timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      organizationsId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reservations_fetched_successfully",
      data: reservations,
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

const getReservationDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const Reservation = await reservationService.getReservationDetails(id);
    if (!Reservation) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Reservation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_details_fetched_successfully",
      data: Reservation,
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

const updateReservation = async (req, res) => {
  const { id } = req.params;
const {
  title,
  availableReservations,
  maxCapacityPerReservation,
  conditionType,
  amount,
  minimumSpend,
  prepayAmount,
  ticketType,
  customText,
  taxPercentage,
  needsConfirmation,
  optionalEventId,
  status,
  organizationId
} = req.body;
const userId = req.user._id;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    userId,
title,
  availableReservations,
  maxCapacityPerReservation,
  conditionType,
  amount,
  minimumSpend,
  prepayAmount,
  ticketType,
  customText,
  taxPercentage,
  needsConfirmation,
  optionalEventId,
  status,
  organizationId,
  };

  try {
    const updated = await reservationService.updateReservation(id, data);
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
        translationKey: "Reservation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_updated_successfully",
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

const deleteReservation = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await reservationService.deleteReservation(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Reservation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_deleted_successfully",
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
  createReservation,
  getReservations,
  updateReservation,
  deleteReservation,
  getReservationDetails,
};