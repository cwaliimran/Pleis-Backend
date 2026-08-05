
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  convertTimezoneToUtcDateOnly,
  convertToUtcDateOnly,
} = require("../../helperUtils/responseUtil");

const reservationService = require("./reservationService");

const createReservation = async (req, res) => {
  const {
    reservationType,
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
    ticketRequirement,
    organizationId,
    timingSlots,
    allowPreOrderMenuItems = false,
    bonusPoints = 0
  } = req.body;

  const userId = req.user._id;
  const timezone = req.user.timezone;

  if (conditionType === "minimumSpendOnLocation") {
    if (!amount && !customText) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "either_amount_or_customText_must_be_provided_when_conditionType_is_'minimumSpendOnLocation'",
      });
    }
  }

  if (
    !validateParams(req, res, {
      rawData: [
        "reservationType",
        "availableReservations",
        "maxCapacityPerReservation",
        "conditionType",
        "taxPercentage",
        "status",
        "organizationId",
      ],
    })
  ) return;
  if (ticketRequirement === true || ticketRequirement === "true") {
    if (!validateParams(req, res, {
      rawData: [
        "ticketType"
      ],
    })) return;
  }

  if (conditionType == "fixedPrice" || conditionType == "prepayOption") {
    if (
      !validateParams(req, res, {
        rawData: [
          "reservationType",
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
  }

  // Timing slots validation
  if (timingSlots?.enabled === true) {
    const slots = timingSlots.dateTimeSlots || [];

    if (!Array.isArray(slots) || slots.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "timing_slots_required_when_enabled",
      });
    }

    // Validate and convert each date/time slot
    for (const dateBlock of slots) {
      if (!dateBlock.date) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_date_in_timing_slots",
        });
      }

      if (!Array.isArray(dateBlock.timeSlots) || dateBlock.timeSlots.length === 0) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "time_slots_required_for_date",
        });
      }

      // Convert the date to UTC (midnight) for each dateBlock
      const dateUtc = convertTimezoneToUtcDateOnly(dateBlock.date, timezone);

      // Loop over each time slot and convert start/end times to UTC
      for (const slot of dateBlock.timeSlots) {
        // 1️⃣ Convert startTime and endTime to UTC using provided timezone
        if (slot.startTime && slot.endTime) {
          const startUtc = convertTimezoneToUtc(
            `${dateBlock.date} ${slot.startTime}`,
            timezone,
            "YYYY-MM-DDTHH:mm:ss.SSSZ hh:mm A"
          );

          const endUtc = convertTimezoneToUtc(
            `${dateBlock.date} ${slot.endTime}`,
            timezone,
            "YYYY-MM-DDTHH:mm:ss.SSSZ hh:mm A"
          );

          // 2️⃣ Replace startTime and endTime with the UTC converted values
          slot.startTime = startUtc;
          slot.endTime = endUtc;
        } else {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "invalid_start_or_end_time_in_slot",
          });
        }
      }

      // Replace the date with UTC date (adjusted for timezone)
      dateBlock.date = convertToUtcDateOnly(dateBlock.date, timezone);

    }
  }

  let data = {
    userId,
    reservationType,
    availableReservations,
    maxCapacityPerReservation,
    conditionType,
    amount,
    ticketType,
    customText,
    taxPercentage,
    needsConfirmation,
    ticketRequirement,
    optionalEventId,
    status,
    organizationId,
    allowPreOrderMenuItems,
    timingSlots: timingSlots || { enabled: false, dateTimeSlots: [] },
    bonusPoints
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


const getavailableReservations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range, organizationsId, companyOrganizer } = req.query;
  try {
    if (
      (!companyOrganizer || companyOrganizer === "undefined" || companyOrganizer === "null") &&
      (!organizationsId || !Array.isArray(JSON.parse(organizationsId)) || JSON.parse(organizationsId).length === 0)
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "companyOrganizer_or_organizationsId_is_required",
      });
    }

    const userId = companyOrganizer;
    const timezone = req.user.timezone;
    const { reservations, meta } = await reservationService.getavailableReservations({
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
    reservationType,
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
    timingSlots,
    organizationId,
    notes,
    bonusPoints
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
    reservationType,
    availableReservations,
    maxCapacityPerReservation,
    conditionType,
    amount,
    minimumSpend,
    prepayAmount,
    ticketType,
    timingSlots,
    customText,
    taxPercentage,
    needsConfirmation,
    optionalEventId,
    status,
    organizationId,
    notes,
    bonusPoints
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

      if (!Array.isArray(dateBlock.timeSlots) || dateBlock.timeSlots.length === 0) {
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
  const { keyword, status , date, range, organizationsId, companyOrganizer, reservationId } = req.query;

  try {
    if (!organizationsId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "organizationsId_is_required",
      });
    }
    if (!reservationId || reservationId === "undefined" || reservationId === "null") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "reservationId_is_required",
      });
    }

    const userId = companyOrganizer;
    const timezone = req.user.timezone;
    const { reservations, meta } = await reservationService.getUserReservations({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      organizationsId,
      date,
      range,
      reservationId,
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


const updateUserReservationStatus = async (req, res) => {
  const { id, value } = req.params;
const changedBy = req.user._id;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
      enumFields: {
        value: ["pendingPayment", "needsConfirmation", "confirmed", "checkedIn", "rejected", "cancelled", "completed",
        ]
      }
    })
  )
    return;

  try {
    const userReservation = await reservationService.updateUserReservationStatus(id, value, changedBy);
    if (!userReservation) {
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

const updateUserReservation = async (req, res) => {
  const { id, userId } = req.params;
  const {
    firstName,
    lastName,
    partySize,
    phoneNumber,
    reservationType,
    timingSlots,
    notes,
  } = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  const timezone = req.user.timezone;

  let data = {
    id,
    userId,
    firstName,
    lastName,
    partySize,
    phoneNumber,
    reservationType,
    timingSlots,
    notes,

  };

  if (data.timingSlots) {
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

      if (!Array.isArray(dateBlock.timeSlots) || dateBlock.timeSlots.length === 0) {
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
  }


  // Validate params
  if (
    !validateParams(req, res, {
      pathParams: ["id", "userId"],
      objectIdFields: ["id", "userId"],
    })
  ) {
    return; // Ensure you return if validation fails
  }
  const currentUser = req.user;
  // Only admin, manager, or organizer can update other users' profiles
  if (
    currentUser._id.toString() !== id &&
    !["admin", "manager", "organizer"].includes(currentUser.userType)
  ) {
    return sendResponse({
      res,
      statusCode: 403,
      translationKey: "unauthorized_to_perform_this_action",
    });
  }

  try {
    const update = await reservationService.updateUserReservation(data);
    if (!update) {
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


const getReservations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date, range, organizationsId, companyOrganizer } = req.query;
  try {
    if (
      (!companyOrganizer || companyOrganizer === "undefined" || companyOrganizer === "null") &&
      (!organizationsId || organizationsId === "undefined" || organizationsId === "null")
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "companyOrganizer_or_organizationsId_is_required",
      });
    }


    const userId = companyOrganizer;
    const timezone = req.user.timezone;
    //  date = convertTimezoneToUtcDateOnly(
    //     date,
    //     timezone
    //   );
    const { reservations, meta } = await reservationService.getavailableReservations({
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

const getCalendarReservations = async (req, res) => {
  const { date, organization, companyOrganizer } = req.query;

  try {

    if (!validateParams(req, res, {
      queryParams: ["date"],
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    if (
      (!companyOrganizer || companyOrganizer === "undefined" || companyOrganizer === "null") &&
      (!organization || organization === "undefined" || organization === "null")
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "companyOrganizer_and_organization_is_required",
      });
    }

    const timezone = req.user.timezone;
    const { reservations } = await reservationService.getCalendarReservationsService({
      timezone,
      companyOrganizer,
      organization,
      date,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reservations_fetched_successfully",
      data: reservations,
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

const copyUserReservationsController = async (req, res) => {
  try {
    const { reservations, dates } = req.body;
    const timezone = req.user.timezone;

    if (
      !Array.isArray(reservations) ||
      reservations.length === 0 ||
      !Array.isArray(dates) ||
      dates.length === 0
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "reservations_and_dates_required",
      });
    }

    const copiedReservations =
      await reservationService.copyUserReservations({
        reservations,
        dates,
        timezone,
        copiedBy: req.user._id,
      });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "reservations_copied_successfully",
      data: copiedReservations,
    });
  } catch (error) {
  

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error,
    });
  }
};


const copyReservationSlotsController = async (req, res) => {
  try {
    const { reservationIds, targetDate, startTime, reservationType } = req.body;
    const timezone = req.user.timezone;

    if (!validateParams(req, res, {
      rawData: ["reservationIds", "targetDate", "startTime", "reservationType"],
      dateFields: { targetDate: "YYYY-MM-DD", startTime: "hh:mm A" },
    })) return;

    const newReservation =
      await reservationService.copyReservationSlots({
        reservationIds,
        targetDate,
        startTime,
        reservationType,
        timezone,
        copiedBy: req.user._id,
      });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "reservation_copied_successfully",
      data: newReservation,
    });
  } catch (error) {

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message || "internal_server_error",
      error,
    });
  }
};

const changeUsersReservationsTiming = async (req, res) => {
  try {
    const { reservationIds, startTime, endTime } = req.body;
    const timezone = req.user.timezone;

    if (
      !validateParams(req, res, {
        rawData: ["reservationIds", "startTime", "endTime"],
        dateFields: {
          startTime: "hh:mm A",
          endTime: "hh:mm A",
        },
      })
    ) return;

    const updated =
      await reservationService.changeUsersReservationsTiming({
        reservationIds,
        startTime,
        endTime,
        timezone,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "reservation_timing_updated_successfully",
      data: updated,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message || "internal_server_error",
      error,
    });
  }
};
const createReservationPreferences = async (req, res) => {
  const { reservationId, preferences } = req.body;
  const userId = req.user._id;

  if (
    !validateParams(req, res, {
      rawData: ["reservationId", "preferences"],
      objectIdFields: ["reservationId"],
    })
  ) return;

  try {
    const result = await reservationService.createReservationPreferences({
      reservationId,
      preferences,
      userId,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "reservation_preferences_created_successfully",
      data: result,
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
  getUserReservations,
  updateUserReservationStatus,
  updateUserReservation,
  getavailableReservations,
  getCalendarReservations,
  copyUserReservationsController,
  copyReservationSlotsController,
  changeUsersReservationsTiming,
  createReservationPreferences,
};