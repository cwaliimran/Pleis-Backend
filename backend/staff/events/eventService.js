// services/eventService.js

const eventRepo = require("./eventRepository");
const _ = require("lodash");
const { formatEventResponse } = require("./formatter/eventFormatter");

const getEvents = async ({ page, limit, keyword, status, startDate, endDate, organization, timezone, filter }) => {
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

  if (status) {
    query.status = status;
    //if status is active then also check dates are not past
    if (status === "active" && filter !== "") {
      query["schedule.endDateTime"] = { $gte: new Date() };
    }
  } else {
    query.status = { $ne: "deleted" };
    //remove template events from normal listing
    query["recurringMeta.isTemplate"] = { $ne: true };
  }

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
  const [event] = await Promise.all([eventRepo.findEventById(id),
  ])
  let data = formatEventResponse(event, { timezone });
  return data
};

module.exports = {
  getEvents,
  getEventDetails,
};
