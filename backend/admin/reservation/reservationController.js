
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
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
  organizationId,
  timingSlots
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

    // Validate and convert each date/time
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
  }else{
    //don't check for empty array if timingSlots is disabled only apply format conversion
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
  }

  let data = {
    userId,
    // companyOrganizer:userId,
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
  organizationId,
  timingSlots: timingSlots || { enabled: false, dateTimeSlots: [] },
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
  const { keyword, status = "active", date, range ,organizationsId , companyOrganizer} = req.query;
  try {
console.log("companyOrganizer:", companyOrganizer);
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
  organizationId
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
  const { keyword, status = "active", date, range ,organizationsId , companyOrganizer,reservationStatus="pending",reservationId} = req.query;
  try {
if (
  (!companyOrganizer || companyOrganizer === "undefined" || companyOrganizer === "null") && 
  (!organizationsId || !Array.isArray(JSON.parse(organizationsId)) || JSON.parse(organizationsId).length === 0)
) {
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "companyOrganizer_or_organizationsIds_is_required",
  });
}
if(!reservationId || reservationId === "undefined" || reservationId === "null"){
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
      reservationStatus,
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







const   updateUserReservationStatus = async (req, res) => {
  const { id , value} = req.params;
  const validStatuses = ["confirmed", "rejected", "pending", "cancelled"];
  if (!validStatuses.includes(value)) {
    return res.status(404).json({
      message: "Invalid reservation status value. Accepted values are: confirmed, rejected, pending, cancelled.",
    });
  }
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await reservationService.updateUserReservationStatus(id,value);
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
      translationKey: "Reservation_cancelled_successfully",
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

  };

  if (data.timeSlots) {
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
              console.log("start time ",slots.startTime );

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



module.exports = {
  createReservation,
  getReservations,
  updateReservation,
  deleteReservation,
  getReservationDetails,
  getUserReservations,
  updateUserReservationStatus,
  updateUserReservation,
};