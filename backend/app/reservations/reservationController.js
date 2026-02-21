const { default: mongoose } = require("mongoose");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  convertTimezoneToUtcDateOnly,
  convertToUtcDateOnly,
} = require("../../helperUtils/responseUtil");
const reservationService = require("./reservationService");
const { validateReservationPayload } = require("./validators/reservationValidation");


const createReservation = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const normalizedReservation =
      validateReservationPayload(req, res, req.body);

    if (!normalizedReservation) return;

    const result =
      await reservationService.createReservationService(
        {
          ...normalizedReservation,
          userId: req.user._id,
        },
        session
      );

    if (!result.success) {
      await session.abortTransaction();

      return sendResponse({
        res,
        statusCode: 409,
        translationKey: result.error
      });
    }

    await session.commitTransaction();

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Reservation_created_successfully",
      data: result.reservation,
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  } finally {
    session.endSession();
  }
};


const getReservations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "confirmed", date, availability = "", eventId, organizationId } = req.query;
  const timezone = req.user.timezone;
  try {
    if (
      !date || // Check if date is missing
      (
        (eventId === undefined || eventId === null || eventId === "undefined" || eventId === "null") && // Check if eventId is missing or invalid
        (organizationId === undefined || organizationId === null || organizationId === "undefined" || organizationId === "null") // Check if organizationId is missing or invalid
      )

    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "date_and_eventId_or_organizationId_is_required",
      });
    }

    const userId = req.user._id;
    eventId, organizationId;

    if (eventId && eventId !== "undefined" && eventId !== "null") {
      eventId = eventId;
    } else if (
      organizationId &&
      organizationId !== "undefined" &&
      organizationId !== "null"
    ) {
      organizationId = organizationId;
    }

    const { reservations, meta } = await reservationService.getReservations({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      eventId,
      organizationId,
      date,
      availability
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
const getUserReservationDetails = async (req, res) => {
  const { id } = req.params;  // Capture the ID from params
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;


  try {


    // Call the service directly with the ID
    const reservationDetails = await reservationService.getUserReservationDetailsService(id, timezone);


    if (!reservationDetails) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Reservation_not_found",
      });
    }

    // Send the response with the reservation details
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_details_fetched_successfully",
      data: reservationDetails,
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

const getUserReservations = async (req, res) => {

  const { page, limit } = parsePaginationParams(req);
  let { keyword, date } = req.query;
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { reservations, meta } = await reservationService.getUserReservations({
      timezone,
      page,
      limit,
      keyword,
      userId,
      date,
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

const transferReservation = async (req, res) => {
  try {
    const { timezone, _id: userId } = req.user;
    const { reservationId, newUserId } = req.body;

    // ==============================
    // STEP 1: PREPARE VALIDATION DATA
    // ==============================
    const validateData = {
      objectIdFields: ["reservationId", "newUserId"],
    };

    // ==============================
    // STEP 2: VALIDATE ALL FIELDS
    // ==============================
    if (!validateParams(req, res, validateData)) return;

    // ==============================
    // STEP 3: TRANSFER RESERVATION
    // ==============================
    const { success, message } =
      await reservationService.transferReservation(
        reservationId,
        newUserId,
        userId
      );

    if (!success) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: message,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: message,
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

const acceptReservationChange = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  // Validate params
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const result =
      await reservationService.acceptReservationChange(
        id,
        userId
      );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_change_accepted",
      data: result,
    });
  } catch (error) {
    const readableError =
      getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};

const cancelReservation = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const result = await reservationService.cancelReservation(
      id,
      userId
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_cancelled_successfully",
      data: result,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};


module.exports = {
  createReservation,
  getReservations,
  getUserReservations,
  getUserReservationDetails,
  transferReservation,
  acceptReservationChange,
  cancelReservation,
};
