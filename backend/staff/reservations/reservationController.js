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
  const {
    firstName,
    lastName,
    phoneNumber,
    partySize,
    reservationType,
    companyOrganizer,
    organizationId,
    timingSlots,
    notes = "",

  } = req.body;

  const timezone = req.user.timezone;

  // Validate required fields
  if (
    !validateParams(req, res, {
      rawData: [
        "firstName",
        "lastName",
        "phoneNumber",
        "partySize",
        "reservationType",
        "companyOrganizer",
        "organizationId",
        "timingSlots",
      ],
      enumFields: {
        reservationType: [
          "regular",
          "vip",
          "outdoor",
          "private",
          "bar",
          "window",
        ],
        paymentMethod: ["applePay", "card", "cash", "payLater"],
      },
      objectIdFields: [
        "organizationId",
        "companyOrganizer",
      ],
    })
  )
    return;

  // Don't check for empty array if timingSlots is disabled, only apply format conversion
  const slots = timingSlots.dateTimeSlots || [];
  for (const dateBlock of slots) {
    if (!dateBlock.date) continue;

    for (const slot of dateBlock.timeSlots) {
      if (!slot.startTime || !slot.endTime) continue;

      // Convert to UTC DateTime strings
      const startUtc = convertTimezoneToUtc(
        `${dateBlock.date} ${slot.startTime}`,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
      const endUtc = convertTimezoneToUtc(
        `${dateBlock.date} ${slot.endTime}`,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );

      // Replace in object
      slot.startTime = startUtc;
      slot.endTime = endUtc;
    }
  }

  const data = {
    firstName,
    lastName,
    phoneNumber,
    partySize,
    reservationType,
    organizationId,
    companyOrganizer,
    notes,
    paymentMethod: "cash",
    timingSlots: timingSlots || { enabled: false, dateTimeSlots: [] },
    timezone,

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
};
