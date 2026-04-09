const { createReservationService } = require("../../app/reservations/reservationService");
const { validateReservationPayload } = require("../../app/reservations/validators/reservationValidation");
const mongoose = require("mongoose");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  convertToUtcDateOnly,
} = require("../../helperUtils/responseUtil");
const reservationService = require("./reservationService");


const createReservation = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();
    const normalizedReservation =
      validateReservationPayload(req, res, req.body);
    if (!normalizedReservation) return;
    const result =
      await createReservationService(
        {
          ...normalizedReservation,
          userId: null, //booking being made by staff from staff app
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
      translationKey: "reservation_created_successfully",
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


const getUserBookingsByDate = async (req, res) => {
  let { date, status = "active" } = req.query;
  const timezone = req.user.timezone;

  if (!date) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "date_is_required",
    });
  }

  try {
    const bookings = await reservationService.getUserBookingsByDate({
      date,
      status,
      timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reservations_fetched_successfully",
      data: bookings,
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


const updateReservationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
      rawData: ["status"],
      enumFields: {
        status: ["active", "checkedIn", "cancelled", "inactive", "deleted", "completed"],
      },
    })
  )
    return;

  try {
    const cancelled = await reservationService.updateReservationStatus(id, status);
    if (!cancelled) {
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
  getUserBookingsByDate,
  updateReservationStatus,
  // getReservations
};
