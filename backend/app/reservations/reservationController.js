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

  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: err,
    });

  } finally {
    session.endSession();
  }
};


const getReservations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "active", date, eventId, organizationId } = req.query;
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

    date = convertToUtcDateOnly(
      date,
      "UTC"
    );


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
    const reservationDetails = await reservationService.getReservationDetails(id, timezone);


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
const updateReservation = async (req, res) => {
  const { id } = req.params;
  const {
    partySize,
    reservationType,
    optionalEventId,
    organizationId,
    timingSlots,
    notes,
  } = req.body;
  const userId = req.user._id;
  const timezone = req.user.timezone;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = {
    userId,
    partySize,
    reservationType,
    optionalEventId,
    organizationId,
    timingSlots,
    notes,
  };
  // --- Validate timing slots if enabled ---
  if (data.timingSlots?.enabled) {
    const slots = data.timingSlots.dateTimeSlots || [];

    if (!Array.isArray(slots) || slots.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "timing_slots_required_when_enabled",
      });
    }

    for (const dateBlock of slots) {
      if (!dateBlock.date) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_date_in_timing_slots",
        });
      }

      if (
        !Array.isArray(dateBlock.timeSlots) ||
        dateBlock.timeSlots.length === 0
      ) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "time_slots_required_for_date",
        });
      }

      for (const slot of dateBlock.timeSlots) {
        if (!slot.startTime || !slot.endTime) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "invalid_start_or_end_time_in_slot",
          });
        }

        // Convert times to UTC
        slot.startTime = convertTimezoneToUtc(
          `${dateBlock.date} ${slot.startTime}`,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
        slot.endTime = convertTimezoneToUtc(
          `${dateBlock.date} ${slot.endTime}`,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
      }
    }
  } else {
    //don't check for empty array if timingSlots is disabled only apply format conversion
    if (data.timingSlots) {
      const slots = data.timingSlots.dateTimeSlots || [];
      for (const dateBlock of slots) {
        if (!dateBlock.date) continue;

        for (const slot of dateBlock.timeSlots) {
          if (!slot.startTime || !slot.endTime) continue;

          // Convert times to UTC
          slot.startTime = convertTimezoneToUtc(
            `${dateBlock.date} ${slot.startTime}`,
            timezone,
            "YYYY-MM-DD hh:mm A"
          );
          slot.endTime = convertTimezoneToUtc(
            `${dateBlock.date} ${slot.endTime}`,
            timezone,
            "YYYY-MM-DD hh:mm A"
          );
        }
      }
    }
  }
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
const getUserReservations = async (req, res) => {

  const { page, limit } = parsePaginationParams(req);
  let { keyword, status = "active", date } = req.query;
  try {
    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { reservations, meta } = await reservationService.getUserReservations({
      timezone,
      page,
      limit,
      keyword,
      status,
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


module.exports = {
  createReservation,
  getReservations,
  updateReservation,
  deleteReservation,
  getUserReservations,
  getReservationDetails,
  transferReservation,
};
