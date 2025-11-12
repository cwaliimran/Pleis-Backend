const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  isValidNanoid,
} = require("../../helperUtils/responseUtil");
const { getVenueDetails } = require("../venues/venuesService");

const eventService = require("./eventService");

const createEvent = async (req, res) => {

  let { timezone, _id: userId } = req.user;

  const {
    basicInfo = {},
    schedule = {},
    ticketing = {},
  } = req.body;

  let validateData = {
    rawData: [
      "basicInfo.title",
      "basicInfo.organization",
      "basicInfo.venue",
      "basicInfo.categories",
    ],
    objectIdFields: ["basicInfo.organization", "basicInfo.venue", "basicInfo.categories"],
  }

  let ticketingData = null;
  //if ticketing is provided, validate ticketing fields
  if (ticketing && Object.keys(ticketing).length > 0) {
    validateData.rawData.push("ticketing.title", "ticketing.price");

    if (ticketing?.timingSlots?.enabled == false) {
      validateData.rawData.push("ticketing.quantity");
    } else {
      // quantity is required for each slot when timingSlots is enabled
      validateData.rawData.push("ticketing.timingSlots.dateTimeSlots");
    }


    // Add conditional validation for timeSensitivePricing
    if (ticketing.timeSensitivePricing) {
      const { earlyBird, lastMinute } = ticketing.timeSensitivePricing;
      validateData.dateFields = {};

      if (earlyBird?.endDate) {
        validateData.dateFields["ticketing.timeSensitivePricing.earlyBird.endDate"] = "YYYY-MM-DD";
      }
      if (lastMinute?.startDate) {
        validateData.dateFields["ticketing.timeSensitivePricing.lastMinute.startDate"] = "YYYY-MM-DD";
      }
    }

    if (ticketing.status == "scheduled") {
      validateData.dateFields["ticketing.scheduledPublishAt"] = "YYYY-MM-DD hh:mm A"
    }


    // Convert scheduledPublishAt to UTC
    if (ticketing.status == "scheduled" && ticketing.scheduledPublishAt) {
      ticketing.scheduledPublishAt = convertTimezoneToUtc(
        ticketing.scheduledPublishAt,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    } else {
      ticketing.scheduledPublishAt = null;
    }

    // Timing slots validation
    if (ticketing.timingSlots?.enabled === true) {
      const slots = ticketing.timingSlots?.dateTimeSlots || [];

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
    } else {
      //don't check for empty array if timingSlots is disabled only apply format conversion
      const slots = ticketing.timingSlots?.dateTimeSlots || [];
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

    // Transform timeSensitivePricing date fields to UTC
    if (ticketing.timeSensitivePricing) {
      const { earlyBird, lastMinute } = ticketing.timeSensitivePricing;

      if (earlyBird?.endDate) {
        earlyBird.endDate = convertTimezoneToUtc(
          earlyBird.endDate,
          timezone,
          "YYYY-MM-DD"
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

    // Construct final payload
    ticketingData = {
      ...ticketing,
      title: ticketing.title.trim(),
      timingSlots: ticketing.timingSlots || { enabled: false, dateTimeSlots: [] },
      repeatable: ticketing.repeatable || { isRepeatable: false, visits: 1 },
      resaleProtection: ticketing.resaleProtection || "none",
      transferFee: ticketing.transferFee || 0,
      timeSensitivePricing: ticketing.timeSensitivePricing || {},
      fastTrackEntry: {
        enabled: ticketing.fastTrackEntry?.enabled || false
      },
      requiresReservation: {
        enabled: ticketing.requiresReservation?.enabled || false,
        type: ticketing.requiresReservation?.type || "any"
      },
    };
  }


  //find if venue exists
  const venueItem = await getVenueDetails(basicInfo.venue, ['location.coordinates']);
  if (!venueItem) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_venue",
    });
  }

  let eventType = schedule.type || "oneTime";

  if (eventType === "oneTime") {
    // Validate both start and end date for one-time events
    validateData.dateFields = {
      "schedule.startDateTime": "YYYY-MM-DD hh:mm A",
      "schedule.endDateTime": "YYYY-MM-DD hh:mm A"
    };
  }

  const recurringDetails = schedule.recurringDetails || {};
  if (recurringDetails.isEnabled) {
    // Recurring event validation
    validateData.dateFields = {
      "schedule.startDateTime": "YYYY-MM-DD hh:mm A"
    };

    validateData.rawData.push("schedule.recurringDetails");
    validateData.rawData.push("schedule.recurringDetails.frequency");
    validateData.rawData.push("schedule.recurringDetails.interval");
    validateData.rawData.push("schedule.recurringDetails.endType");

    // Conditional validation based on endType
    if (recurringDetails.endType === "onDate") {
      validateData.dateFields["schedule.recurringDetails.endDate"] = "YYYY-MM-DD";
    } else if (recurringDetails.endType === "afterOccurrences") {
      validateData.rawData.push("schedule.recurringDetails.occurrences");
    }

    // Validate daysOfWeek if frequency is weekly or monthly
    if (["weekly", "monthly"].includes(recurringDetails.frequency)) {
      validateData.rawData.push("schedule.recurringDetails.daysOfWeek");
    }
  }

  if (!validateParams(req, res, validateData)) return;

  // Construct event data per schema
  const eventData = {
    basicInfo: {
      media: {
        name: basicInfo.media?.name || "",
        type: basicInfo.media?.type || "image", // Ensure 'image' as default
      },
      title: basicInfo.title.trim(),
      description: basicInfo.description?.trim() || "",
      organization: basicInfo.organization,
      venue: basicInfo.venue,
      venueLocation: venueItem.location, //set venueLocation from venue
      categories: Array.isArray(basicInfo.categories) ? basicInfo.categories : [],
      tags: Array.isArray(basicInfo.tags) ? basicInfo.tags : [],
    },
    schedule: {
      type: schedule.type || "oneTime",
      startDateTime: convertTimezoneToUtc(schedule.startDateTime, timezone, "YYYY-MM-DD hh:mm A"),
      endDateTime: convertTimezoneToUtc(schedule.endDateTime, timezone, "YYYY-MM-DD hh:mm A"),
      recurringDetails: schedule.recurringDetails || null,
    },
    creator: userId,
  };

  try {
    const event = await eventService.createEvent({ data: eventData, ticketingData }, timezone);

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "event_created_successfully",
      data: event,
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

const getEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", startDate, endDate, organization } = req.query;
  let { _id, timezone } = req.user;
  try {


    if (organization) {
      if (!validateParams(req, res, {
        objectIdFields: ["organization"],
      })) return;
    }

    if (startDate && !validateParams(req, res, {
      dateFields: {
        startDate: "YYYY-MM-DD",
      },
    })) return;

    if (endDate && !validateParams(req, res, {
      dateFields: {
        endDate: "YYYY-MM-DD",
      },
    })) return;

    let { events, meta } = await eventService.getEvents({
      page,
      limit,
      keyword,
      status,
      creator: _id,
      startDate,
      endDate,
      organization,
      timezone,
    });


    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "events_fetched_successfully",
      data: events,
      meta: generateMeta(page, limit, meta.total),
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

const getPublicEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword } = req.query;

  try {
    const { events, meta } =
      await eventService.getPublicEvents({
        page,
        limit,
        keyword,
      });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "public_events_fetched_successfully",
      data: events,
      meta: generateMeta(page, limit, meta.total),
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

const updateEvent = async (req, res) => {
  const { id } = req.params;

  let { timezone } = req.user;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = ({
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    image,
    tags,
    description,
    title,
    schedule,
  } = req.body);

  try {
    // Now validate schedule if provided
    if (ticketing.schedule !== undefined) {
      let validateData = { rawData: [], dateFields: {} };
      const recurringDetails = ticketing.schedule.recurringDetails;

      if (recurringDetails && recurringDetails.isEnabled) {
        validateData.dateFields = {
          "schedule.startDateTime": "YYYY-MM-DD hh:mm A",
        };

        validateData.rawData.push("schedule.recurringDetails");
        validateData.rawData.push("schedule.recurringDetails.frequency");
        validateData.rawData.push("schedule.recurringDetails.interval");
        validateData.rawData.push("schedule.recurringDetails.endType");

        if (recurringDetails.endType === "onDate") {
          validateData.dateFields["schedule.recurringDetails.endDate"] = "YYYY-MM-DD";
        } else if (recurringDetails.endType === "afterOccurrences") {
          validateData.rawData.push("schedule.recurringDetails.occurrences");
        }

        if (["weekly", "monthly"].includes(recurringDetails.frequency)) {
          validateData.rawData.push("schedule.recurringDetails.daysOfWeek");
        }

        if (!validateParams(req, res, validateData)) return;
      } else {
        validateData.dateFields = {
          "schedule.startDateTime": "YYYY-MM-DD hh:mm A",
          "schedule.endDateTime": "YYYY-MM-DD hh:mm A",
        };

        if (!validateParams(req, res, validateData)) return;
      }
    }


    const updated = await eventService.updateEvent(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

    //get updated event details
    const updatedEvent = await eventService.getEventDetails(id, timezone);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_updated_successfully",
      data: updatedEvent,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.name === "ValidationError" ? 400 : 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const deleteEvent = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await eventService.deleteEvent(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_deleted_successfully",
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

const getEventDetails = async (req, res) => {
  let { id } = req.params;
  let { timezone } = req.user;
  // Accept both nanoid and ObjectId for event id
  if (
    (!isValidNanoid(id) && !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    }))
  ) return;

  if (isValidNanoid(id)) {
    // If nanoid, resolve to ObjectId
    id = await eventService.getEventIdByNanoid(id);
  }


  try {
    let data = await eventService.getEventDetails(id, timezone);
    if (!data) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_details_fetched_successfully",
      data,
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

const cloneEvent = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  try {
    const clonedEvent = await eventService.cloneEvent(id);
    if (!clonedEvent) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "event_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "event_cloned_successfully",
      data: clonedEvent,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: error.name === "ValidationError" ? 400 : 500,
      translationKey: "internal_server",
      error,
    });
  }
};

const getMinimalEventsInfo = async (req, res) => {
  const { organization } = req.query;
  let { timezone } = req.user;
  try {


    if (organization) {
      if (!validateParams(req, res, {
        objectIdFields: ["organization"],
      })) return;
    }

    let { events } = await eventService.getMinimalEventsInfo({
      organization,
      timezone,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "events_fetched_successfully",
      data: events,
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
  createEvent,
  getEvents,
  getPublicEvents,
  cloneEvent,
  updateEvent,
  deleteEvent,
  getEventDetails,
  getMinimalEventsInfo,
};
