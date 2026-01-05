// services/eventService.js

const eventRepo = require("./eventRepository");
const _ = require("lodash");
const { formatEventResponse } = require("./formatter/eventFormatter");
const { formatEventAttendeesResponse } = require("./formatter/eventAttendeesFormatter");

const getEvents = async ({ page, limit, keyword, startDate, endDate, organization, timezone, filter }) => {
  const query = {};
  // ALWAYS exclude templates events
  //templates event are only for internal use to generate occurrences
  query.$and = [
    {
      $or: [
        { "recurringMeta.isTemplate": false },
        { "recurringMeta.isTemplate": { $exists: false } },
      ],
    },
  ];

  query.status = { $ne: "deleted" };
  //remove template events from normal listing
  query["recurringMeta.isTemplate"] = { $ne: true };

  if (organization) {
    query["basicInfo.organization"] = organization;
  }

  if (startDate) {
    query["schedule.startDateTime"] = { $gte: new Date(startDate) };
  }
  if (endDate) {
    query["schedule.endDateTime"] = { $lte: new Date(endDate) };
  }

  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [events, eventsCounts] =
    await Promise.all([
      eventRepo.getEventsWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      eventRepo.getEventsCounts(query),
    ]);

  let { totalFiltered = 0, total = 0, active = 0, inactive = 0 } = eventsCounts || {};

  let formattedEvents = events.map(event => formatEventResponse(event, { timezone }));

  return {
    events: formattedEvents,
    meta: {
      page,
      limit,
      total: totalFiltered,
      tagsCount: { total, active, inactive },
    },
  };
};

const getEventDetails = async (id, timezone) => {
  const [event, audienceAnalytics, ticketAttendanceAnalytics] = await Promise.all([eventRepo.findEventById(id),
  eventRepo.getEventAudienceAnalytics(id),
  eventRepo.getEventTicketAttendanceAnalytics(id)
  ])
  // let data = formatEventResponse(event, { timezone });
  // data.audienceAnalytics = audienceAnalytics;
  // data.ticketAttendanceAnalytics = ticketAttendanceAnalytics;
  return ticketAttendanceAnalytics
};

const getEventAttendeesService = async (eventId, keyword, page, limit, skip) => {
  let data = await eventRepo.getEventAttendees({ eventId, keyword, page, limit, skip });
  let attendees = data.data.map(attendee => formatEventAttendeesResponse(attendee));
  return { attendees, meta: data.meta };
}

// SERVICE
const checkInEventAttendeeService = async (eventId, ticketBookingId, scannedBy) => {
  return eventRepo.checkInEventAttendee(eventId, ticketBookingId, scannedBy);
};




module.exports = {
  getEvents,
  getEventDetails,
  getEventAttendeesService,
  checkInEventAttendeeService
};
