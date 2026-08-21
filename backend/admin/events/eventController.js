const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  isValidNanoid,
  uniqueObjectIds,
} = require("../../helperUtils/responseUtil");
const { getVenueDetails } = require("../venues/venuesService");
const mongoose = require('mongoose');
const eventService = require("./eventService");
const ticketingService = require("../ticketing/ticketingsService");
const { updateEventService } = require("./updateEventService");
const { getNotificationsByEventIdService } = require("../notifications/notificationsService");
const { getRatingsByEventIdService } = require("../reviews/reviewsService");
const createEvent = async (req, res) => {
  let { timezone, _id: userId } = req.user;

  const {
    basicInfo = {},
    schedule = {},
    ticketing = {},
    preOrdersEnabled = false,
    // we will IGNORE any incoming recurringMeta from client for safety
  } = req.body;

  // ==============================
  // PRE-CALC: RECURRING FLAGS
  // ==============================
  const eventType = schedule.type || "oneTime";
  const recurringDetails = schedule.recurringDetails || {};
  const isRecurringEnabled = !!recurringDetails.isEnabled;

  // ==============================
  // STEP 1: PREPARE VALIDATION DATA
  // ==============================
  let validateData = {
    rawData: [
      "basicInfo.title",
      "basicInfo.organization",
      "basicInfo.venue",
      "basicInfo.categories",
    ],
    objectIdFields: ["basicInfo.organization", "basicInfo.venue", "basicInfo.categories"],
    dateFields: {},
  };

  if (ticketing && Object.keys(ticketing).length > 0) {
    validateData.rawData.push("ticketing.title", "ticketing.price");

    if (ticketing?.timingSlots?.enabled === false) {
      validateData.rawData.push("ticketing.quantity");
    } else {
      validateData.rawData.push("ticketing.timingSlots.dateTimeSlots");
    }

    if (ticketing.timeSensitivePricing) {
      const { earlyBird, lastMinute } = ticketing.timeSensitivePricing;
      if (earlyBird?.endDate)
        validateData.dateFields["ticketing.timeSensitivePricing.earlyBird.endDate"] = "YYYY-MM-DD hh:mm A";
      if (lastMinute?.startDate)
        validateData.dateFields["ticketing.timeSensitivePricing.lastMinute.startDate"] = "YYYY-MM-DD hh:mm A";
    }

    validateData.dateFields["ticketing.scheduledPublishAt"] = "YYYY-MM-DD hh:mm A";
  }

  // Event schedule validation dates
  if (eventType === "oneTime") {
    validateData.dateFields["schedule.startDateTime"] = "YYYY-MM-DD hh:mm A";
    validateData.dateFields["schedule.endDateTime"] = "YYYY-MM-DD hh:mm A";
  }

  // ==============================
  // STEP 2.5: RECURRING LOGIC VALIDATION
  // ==============================
  if (isRecurringEnabled) {
    const { endType, endDate, occurrences } = recurringDetails;

    switch (endType) {
      case "never":
        // ✅ nothing required
        break;

      case "onDate":
        if (!endDate) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "recurring_end_date_required",
          });
        }
        break;

      case "afterOccurrences":
        if (!occurrences || occurrences < 1) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "recurring_occurrences_required",
          });
        }
        break;

      default:
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_recurring_end_type",
        });
    }
  }

  // ==============================
  // STEP 2: VALIDATE ALL FIELDS
  // ==============================
  if (!validateParams(req, res, validateData)) return;

  // OPTIONAL: You can add some extra server-side recurrence rules here:
  // - if endType === "afterOccurrences" then occurrences > 0
  // - if endType === "onDate" then endDate >= startDateTime (date part)
  // - when recurring + timingSlots.enabled, you may enforce single date block, etc.

  // ==============================
  // STEP 3: APPLY CONVERSIONS AFTER VALIDATION
  // ==============================
  let ticketingData = null;
  if (ticketing && Object.keys(ticketing).length > 0) {
    // Convert scheduledPublishAt
    if (ticketing.scheduledPublishAt) {
      ticketing.scheduledPublishAt = convertTimezoneToUtc(
        ticketing.scheduledPublishAt,
        timezone,
        "YYYY-MM-DD hh:mm A"
      );
    } else {
      ticketing.scheduledPublishAt = null;
    }

    // Convert timing slots
    if (ticketing.timingSlots?.enabled) {
      const slots = ticketing.timingSlots.dateTimeSlots || [];
      for (const dateBlock of slots) {
        for (const slot of (dateBlock.timeSlots || [])) {
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

    // Convert timeSensitivePricing
    if (ticketing.timeSensitivePricing) {
      const { earlyBird, lastMinute } = ticketing.timeSensitivePricing;
      if (earlyBird?.endDate)
        earlyBird.endDate = convertTimezoneToUtc(earlyBird.endDate, timezone, "YYYY-MM-DD hh:mm A");
      if (lastMinute?.startDate)
        lastMinute.startDate = convertTimezoneToUtc(lastMinute.startDate, timezone, "YYYY-MM-DD hh:mm A");
    }


    // Build ticketing payload
    ticketingData = {
      ...ticketing,
      title: ticketing.title.trim(),
      timingSlots: ticketing.timingSlots || { enabled: false, dateTimeSlots: [] },
      repeatable: ticketing.repeatable || { isRepeatable: false, visits: 1 },
      resaleProtection: ticketing.resaleProtection || "none",
      transferFee: ticketing.transferFee || 0,
      timeSensitivePricing: ticketing.timeSensitivePricing || {},
      fastTrackEntry: {
        enabled: ticketing.fastTrackEntry?.enabled || false,
        quantity: ticketing.fastTrackEntry?.quantity || 0,
        extraPrice: ticketing.fastTrackEntry?.extraPrice || 0,
      },
      requiresReservation: {
        enabled: ticketing.requiresReservation?.enabled || false,
        type: ticketing.requiresReservation?.type || "any",
      },
    };
  }

  // ==============================
  // VENUE VALIDATION (already done)
  // ==============================
  const venueItem = await getVenueDetails(basicInfo.venue, []);
  if (!venueItem) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_venue",
    });
  }

  // ==============================
  // CONSTRUCT EVENT PAYLOAD (after conversions)
  // ==============================
  const scheduleStartUtc = convertTimezoneToUtc(
    schedule.startDateTime,
    timezone,
    "YYYY-MM-DD hh:mm A"
  );
  const scheduleEndUtc = convertTimezoneToUtc(
    schedule.endDateTime,
    timezone,
    "YYYY-MM-DD hh:mm A"
  );

  const eventData = {
    basicInfo: {
      media: {
        name: basicInfo.media?.name || "",
        type: basicInfo.media?.type || "image",
      },
      title: basicInfo.title.trim(),
      description: basicInfo.description?.trim() || "",
      organization: basicInfo.organization,
      venue: basicInfo.venue,
      venueLocation: venueItem.location,
      categories: Array.isArray(basicInfo.categories)
        ? uniqueObjectIds(basicInfo.categories)
        : [],

      tags: Array.isArray(basicInfo.tags)
        ? uniqueObjectIds(basicInfo.tags)
        : [],
      partnerOrganization: basicInfo.partnerOrganization || null,
    },
    schedule: {
      type: schedule.type || "oneTime",
      startDateTime: scheduleStartUtc,
      endDateTime: scheduleEndUtc,
      recurringDetails: isRecurringEnabled ? recurringDetails : null,
    },
    preOrdersEnabled,
    creator: userId,
    status: basicInfo.status || "active", // default to draft if not provided
  };

  // 🔑 IMPORTANT: mark this event as a TEMPLATE on the server
  if (isRecurringEnabled) {
    eventData.recurringMeta = {
      isTemplate: true,
      parentEvent: null,
      occurrenceIndex: 1, // template itself can be treated as occurrence #1
    };
  }

  // ==============================
  // CREATE EVENT (and ticketing in same transaction)
  // ==============================
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


// const updateEventsWithCompanyOrganizer = async () => {
//   try {
//     const events = await Events.find().select('_id basicInfo.organization');

//     for (const event of events) {
//       const organization = event.basicInfo.organization;

//       const organizationData = await Organizations.findById(organization).select('creator');
//       if (organizationData) {
//         const companyOrganizer = organizationData.creator;

//         // Update the event with companyOrganizer
//         await Events.updateOne(
//           { _id: event._id },
//           { $set: { companyOrganizer } }
//         );

//         // Log the update for each event
//         
//       }
//     }

//     return 'Events updated successfully';
//   } catch (error) {
//     console.error(error);
//     throw new Error('Error updating events with company organizer');
//   }
// };



const getEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, startDate, endDate, organization,venue, companyOrganizer, sortBy, sortOrder,date } = req.query;
  const SORT_FIELDS = ["eventName", "venueName", "organizationName","startDate","endDate","revenue","views","status","favorite"];
  const SORT_ORDERS = ["asc", "desc"];
  if ((sortBy && !SORT_FIELDS.includes(sortBy)) || (sortOrder && !SORT_ORDERS.includes(sortOrder))) {
    const key = sortBy && !SORT_FIELDS.includes(sortBy)
      ? "invalid_sort_by_field"
      : "invalid_sort_order";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }

  if ((sortBy && !sortOrder) || (!sortBy && sortOrder)) {
    const key = sortBy ? "sort_order_required_when_sort_by_is_provided"
      : "sort_by_required_when_sort_order_is_provided";
    return sendResponse({ res, statusCode: 400, translationKey: key });
  }
  const { _id, timezone } = req.user;
  if (req.user.userType === "organizer") {
    companyOrganizer = req.user._id;
  }


  try {

    if (startDate) {


      const isValid = validateParams(req, res, {
        dateFields: { startDate: "YYYY-MM-DD" },
      });
      if (!isValid) return;

      startDate = convertTimezoneToUtc(startDate, "UTC");
    }
    if(date){

      const isValid = validateParams(req, res, {
        dateFields: { date: "YYYY-MM-DD" },
      });
      if (!isValid) return;

      date = convertTimezoneToUtc(date, "UTC");
    }

    // ✅ Handle endDate
    if (endDate) {


      const isValid = validateParams(req, res, {
        dateFields: { endDate: "YYYY-MM-DD" },
      });
      if (!isValid) return;

      endDate = convertTimezoneToUtc(endDate, "UTC");

    }

    // ✅ Continue execution normally
    const { events, meta } = await eventService.getEvents({
      page,
      limit,
      keyword,
      status,
      creator: _id,
      startDate,
      endDate,
      organization,
      companyOrganizer,
      timezone,
      sortBy,
      sortOrder,
      date,
      venue,
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

  const { scope = "single" } = req.query; // single | future

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
    feedbackEnabled,
    preOrdersEnabled,
  } = req.body);

  try {
    // Now validate schedule if provided
    if (schedule !== undefined) {
      let validateData = { rawData: [], dateFields: {} };
      const recurringDetails = schedule.recurringDetails;

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

        //convert to utc 
        if (recurringDetails.endType === "onDate") {
          schedule.recurringDetails.endDate = convertTimezoneToUtc(
            schedule.recurringDetails.endDate,
            timezone,
            "YYYY-MM-DD"
          );
        }
        //convert startDateTime to utc
        if (schedule.startDateTime) {
          schedule.startDateTime = convertTimezoneToUtc(
            schedule.startDateTime,
            timezone,
            "YYYY-MM-DD hh:mm A"
          );
          schedule.endDateTime = convertTimezoneToUtc(
            schedule.endDateTime,
            timezone,
            "YYYY-MM-DD hh:mm A"
          );
        }


      } else {
        validateData.dateFields = {
          "schedule.startDateTime": "YYYY-MM-DD hh:mm A",
          "schedule.endDateTime": "YYYY-MM-DD hh:mm A",
        };

        if (!validateParams(req, res, validateData)) return;


        // ==============================
        // CONSTRUCT EVENT PAYLOAD (after conversions)
        // ==============================
        const scheduleStartUtc = convertTimezoneToUtc(
          schedule.startDateTime,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
        schedule.startDateTime = scheduleStartUtc;
        const scheduleEndUtc = convertTimezoneToUtc(
          schedule.endDateTime,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
        schedule.endDateTime = scheduleEndUtc;
      }
    }


    const updated = await updateEventService(id, data, scope);

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
  const { scope = "single" } = req.query; // single | future

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await eventService.deleteEvent(id, scope);
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
  let { organization } = req.params;
  if (!organization) {
    return res.status(400).json({ error: "Organization ID is required" });
  }
  let { timezone } = req.user;
  try {
    organizationId = new mongoose.Types.ObjectId(organization);

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


const getEventTicketings = async (req, res) => {
  let { id } = req.params;
  let { timezone } = req.user;

  // ObjectId for event id
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })) return;


  try {
    const ticketings = await ticketingService.EventsgetTicketings({ timezone, eventId: id });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_ticketings_fetched_successfully",
      data: ticketings,
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

const getEventAnalytics = async (req, res) => {
  let { id } = req.params;

  // ObjectId for event id
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })) return;
  try {
    const analytics = await eventService.getEventAnalyticsService(id);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_analytics_fetched_successfully",
      data: analytics,
    });
  } catch (error) {
    console.log("error==>",error)

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
}

const getEventTicketsAnalytics = async (req, res) => {
  let { id } = req.params;

  // ObjectId for event id
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })) return;
  try {
    const analytics = await eventService.getEventTicketsAnalyticsService(id);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_tickets_analytics_fetched_successfully",
      data: analytics,
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

const getEventNotifications = async (req, res) => {
  let { id } = req.params;
  let { limit, page } = req.query;


  // ObjectId for event id
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })) return;
  try {
    const { notifications, meta } = await getNotificationsByEventIdService(id, limit, page);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_notifications_fetched_successfully",
      data: notifications,
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
const getEventRatings = async (req, res) => {
  let { id } = req.params;
  let { limit, page, keyword } = req.query;


  // ObjectId for event id
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })) return;
  const eventId = id;
  try {
    const { reviews, meta } = await getRatingsByEventIdService(eventId, limit, page, keyword);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "event_ratings_fetched_successfully",
      data: reviews,
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
const getEventbycompanyOrganizer = async (req, res) => {
  let { companyOrganizer } = req.params;
  if (!companyOrganizer) {
    return res.status(400).json({ error: "company organizer ID is required" });
  }
  let { timezone } = req.user;
  try {
    companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);

    if (companyOrganizer) {
      if (!validateParams(req, res, {
        objectIdFields: ["companyOrganizer"],
      })) return;
    }

    let { events } = await eventService.getEventbycompanyOrganizer({
      companyOrganizer,
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

const getEventsByVenueType = async (req, res) => {
  let { venueTypeId } = req.params;
  if (!venueTypeId) {
    return res.status(400).json({ error: "Venue Type ID is required" });
  }
  let { timezone } = req.user;
  try {
    venueTypeId = new mongoose.Types.ObjectId(venueTypeId);

    if (venueTypeId) {
      if (!validateParams(req, res, {
        objectIdFields: ["venueTypeId"],
      })) return;
    }

    let { events } = await eventService.getEventsByVenueTypeService({
      venueTypeId,
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

const getEventsByTag = async (req, res) => {
  let { tagId } = req.params;
  if (!tagId) {
    return res.status(400).json({ error: "Tag ID is required" });
  }
  let { timezone } = req.user;
  try {
    tagId = new mongoose.Types.ObjectId(tagId);

    if (tagId) {
      if (!validateParams(req, res, {
        objectIdFields: ["tagId"],
      })) return;
    }

    let { events } = await eventService.getEventsByTagService({
      tagId,
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
  getEventAnalytics,
  getEventTicketsAnalytics,
  getMinimalEventsInfo,
  getEventTicketings,
  getEventNotifications,
  getEventRatings,
  getEventbycompanyOrganizer,
  getEventsByVenueType,
  getEventsByTag,

};
