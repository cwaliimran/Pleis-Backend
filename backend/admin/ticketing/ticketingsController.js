const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const ticketingsService = require("./ticketingsService");
const { updateTicketingService } = require("./updateTicketingService");

const createTicketing = async (req, res) => {
  const data = req.body;
  const { timezone } = req.user;

  // ==============================
  // HELPER FUNCTIONS
  // ==============================
  const convertSlotsToUtc = (slots) => {
    for (const dateBlock of slots || []) {
      if (!dateBlock.date) continue;
      for (const slot of dateBlock.timeSlots || []) {
        if (!slot.startTime || !slot.endTime) continue;
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
  };

  const convertTimeSensitivePricingToUtc = (pricing) => {
    if (!pricing) return;
    const { earlyBird, lastMinute } = pricing;

    if (earlyBird?.endDate) {
      earlyBird.endDate = convertTimezoneToUtc(
        earlyBird.endDate,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    }
    if (lastMinute?.startDate) {
      lastMinute.startDate = convertTimezoneToUtc(
        lastMinute.startDate,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    }
  };

  // ==============================
  // BASE VALIDATION
  // ==============================
  const validateData = {
    rawData: ["title", "event", "price"],
    objectIdFields: ["event"],
    dateFields: {},
  };

  // Conditional raw data validation for timingSlots
  if (data?.timingSlots?.enabled === false) {
    validateData.rawData.push("quantity");
  } else {
    validateData.rawData.push("timingSlots.dateTimeSlots");
  }

  // Conditional validation for timeSensitivePricing
  if (data.timeSensitivePricing) {
    const { earlyBird, lastMinute } = data.timeSensitivePricing;
    if (earlyBird?.endDate) {
      validateData.dateFields["timeSensitivePricing.earlyBird.endDate"] = "YYYY-MM-DD hh:mm A";
    }
    if (lastMinute?.startDate) {
      validateData.dateFields["timeSensitivePricing.lastMinute.startDate"] = "YYYY-MM-DD hh:mm A";
    }
  }

  // Scheduled ticketing date
  if (data.status === "scheduled") {
    validateData.dateFields = {
      ...validateData.dateFields,
      scheduledPublishAt: "YYYY-MM-DD hh:mm A",
    };
  }

  // ==============================
  // VALIDATE ALL FIELDS FIRST
  // ==============================
  if (!validateParams(req, res, validateData)) return;

  // ==============================
  // CONVERT DATES TO UTC AFTER VALIDATION
  // ==============================
  if (data.status === "scheduled" && data.scheduledPublishAt) {
    data.scheduledPublishAt = convertTimezoneToUtc(
      data.scheduledPublishAt,
      timezone,
      "YYYY-MM-DD hh:mm A"
    );
  } else {
    data.scheduledPublishAt = null;
  }

  convertSlotsToUtc(data.timingSlots?.dateTimeSlots);
  convertTimeSensitivePricingToUtc(data.timeSensitivePricing);

  // ==============================
  // CONSTRUCT FINAL PAYLOAD
  // ==============================
  const ticketingData = {
    ...data,
    title: data.title.trim(),
    timingSlots: data.timingSlots || { enabled: false, dateTimeSlots: [] },
    repeatable: data.repeatable || { isRepeatable: false, visits: 1 },
    resaleProtection: data.resaleProtection || "none",
    transferFee: data.transferFee || 0,
    timeSensitivePricing: data.timeSensitivePricing || {},
    fastTrackEntry: data.fastTrackEntry || { enabled: false },
    requiresReservation: data.requiresReservation || { enabled: false, type: "any" },
  };

  // ==============================
  // CREATE TICKETING
  // ==============================
  try {
    const ticketing = await ticketingsService.createTicketing(timezone, ticketingData);

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "ticketing_created_successfully",
      data: ticketing,
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


const getTicketings = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date, eventId } = req.query;
  const { timezone } = req.user;

  try {
    const { ticketings, meta } = await ticketingsService.getTicketings({
      timezone,
      page,
      limit,
      keyword,
      status,
      date,
      eventId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ticketings_fetched_successfully",
      data: ticketings,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getOrganizationTicketings = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;
  const { id: organization } = req.params;
  const { timezone } = req.user;

  try {
    const { ticketings, meta } = await ticketingsService.getOrganizationTicketings({
      timezone,
      page,
      limit,
      keyword,
      status,
      date,
      organization,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ticketings_fetched_successfully",
      data: ticketings,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getTicketingDetails = async (req, res) => {
  const { id } = req.params;
  const { timezone } = req.user;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const ticketing = await ticketingsService.getTicketingDetails(id, timezone);

    if (!ticketing) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "ticketing_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ticketing_details_fetched_successfully",
      data: ticketing,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};


const updateTicketing = async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const { timezone } = req.user;
  const { scope = "single" } = req.query; // single | future

  // --- Validate route params ---
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  // --- Base field validation ---
  const validateData = {
    rawData: [],
    dateFields: {},
  };

  // --- Optional: validate date formats for timeSensitivePricing ---
  if (data.timeSensitivePricing) {
    const { earlyBird, lastMinute } = data.timeSensitivePricing;
    validateData.dateFields = {};

    if (earlyBird?.endDate) {
      validateData.dateFields = { "timeSensitivePricing.earlyBird.endDate": "YYYY-MM-DD hh:mm A" };
    }
    if (lastMinute?.startDate) {
      validateData.dateFields = { "timeSensitivePricing.lastMinute.startDate": "YYYY-MM-DD hh:mm A" };
    }
  }

  if (data.status == "scheduled") {
    validateData.dateFields = { scheduledPublishAt: "YYYY-MM-DD hh:mm A" };
  }

  // --- Run basic validations ---
  if (!validateParams(req, res, validateData)) return;

  // --- Convert scheduledPublishAt to UTC ---
  if (data.status == "scheduled" && data.scheduledPublishAt) {
    data.scheduledPublishAt = convertTimezoneToUtc(
      data.scheduledPublishAt,
      timezone,
      "YYYY-MM-DD hh:mm A"
    );
  } else {
    data.scheduledPublishAt = null;
  }

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

  // --- Convert timeSensitivePricing dates to UTC ---
  if (data.timeSensitivePricing) {
    const { earlyBird, lastMinute } = data.timeSensitivePricing;

    if (earlyBird?.endDate) {
      earlyBird.endDate = convertTimezoneToUtc(
        earlyBird.endDate,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    }

    if (lastMinute?.startDate) {
      lastMinute.startDate = convertTimezoneToUtc(
        lastMinute.startDate,
        timezone,
        "YYYY-MM-DD"
      );
    }
  }

  try {
    const updated = await updateTicketingService(id, data, scope);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "ticketing_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ticketing_updated_successfully",
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

const deleteTicketing = async (req, res) => {
  const { id } = req.params;
  const { scope = "single" } = req.query; // single | future

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await ticketingsService.deleteTicketing(id, scope);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "ticketing_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ticketing_deleted_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

module.exports = {
  createTicketing,
  getTicketings,
  getOrganizationTicketings,
  updateTicketing,
  deleteTicketing,
  getTicketingDetails,
};
