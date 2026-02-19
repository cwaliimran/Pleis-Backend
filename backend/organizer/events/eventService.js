// services/eventService.js

const { getCurrentDateInTimezone, convertUtcToTimezone, generateMeta } = require("../../helperUtils/responseUtil");
const Organizations = require("@OrganizationModel");
mongoose = require("mongoose");
const eventRepo = require("./eventRepository");
const _ = require("lodash");
const { formatEventResponse } = require("./formatter/eventFormatter");

const createEvent = async ({ data }, timezone) => {
  let event = await eventRepo.createEvent(data);
  if (!event) return null;
  return formatEventResponse(event, { timezone });
};

const getEvents = async ({ page, limit, keyword, status, creator, startDate, endDate, organization, timezone }) => {
  const query = {};
  if (!organization && creator) {
  query.creator = creator;
}
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }

if (organization) {
  let organizationIds = [];

  if (Array.isArray(organization)) {
    organizationIds = organization;
  } else if (typeof organization === "string") {
    // support comma and % separated values
    organizationIds = organization.split(/[, %]+/);
  }

  organizationIds = organizationIds.filter(Boolean);

  if (organizationIds.length > 0) {
    query["basicInfo.organization"] = {
      $in: organizationIds.map(id => new mongoose.Types.ObjectId(id)),
    };
  }
}


  if (startDate) {
    query["schedule.startDateTime"] = { $gte: new Date(startDate) };
  }
  if (endDate) {
    query["schedule.endDateTime"] = { $lte: new Date(endDate) };
  }

if (keyword) {
  query.$or = [
    { "basicInfo.title": { $regex: keyword, $options: "i" } }, // Filter by event title
    { "basicInfo.description": { $regex: keyword, $options: "i" } }, // Filter by event description
    { "basicInfo.organization.basicInfo.name": { $regex: keyword, $options: "i" } }, // Filter by organization name
    { "venue.title": { $regex: keyword, $options: "i" } }, // Filter by venue title
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

const getPublicEvents = async ({ page, limit, keyword, timezone = "Asia/Karachi" }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [events, totalFiltered] = await Promise.all([
    eventRepo.getEventsWithFilters(
      query,
      skip,
      limit === 0 ? 0 : limit
    ),
    eventRepo.countEvents(query),
  ]);

  return {
    events,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateEventsWithVenueLocation = async (venueId, location) => {

  const filter = { "basicInfo.venue": venueId };
  location.type = "Point";
  const update = { $set: { "basicInfo.venueLocation": location } };

  // updateMany to update all matching events and only set the location field
  const result = await eventRepo.updateMany(filter, update);

  return result;
};


const updateEvent = async (id, data) => {
  const event = await eventRepo.findEventById(id);
  if (!event) return null;

  const {
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    venues,
    image,
    tags,
    description,
    title,
    schedule,
    promotion,
  } = data;

  // --- BASIC INFO ---
  if (basicInfo) {
    // ensure basicInfo exists
    if (!event.basicInfo) event.basicInfo = {};

    if (basicInfo.media) {
      event.basicInfo.media = {
        ...(event.basicInfo.media || {}),
        ...basicInfo.media,
      };
    }

    if (basicInfo.socialLinks) {
      event.basicInfo.socialLinks = {
        ...(event.basicInfo.socialLinks || {}),
        ...basicInfo.socialLinks,
      };
    }

    if (basicInfo.organization !== undefined)
      event.basicInfo.organization = basicInfo.organization;

    if (basicInfo.venue !== undefined)
      event.basicInfo.venue = basicInfo.venue;

    if (basicInfo.categories !== undefined)
      event.basicInfo.categories = basicInfo.categories;

    if (basicInfo.tags !== undefined)
      event.basicInfo.tags = basicInfo.tags;

    if (basicInfo.partnerOrganizer !== undefined)
      event.basicInfo.partnerOrganizer = basicInfo.partnerOrganizer;

    if (basicInfo.title !== undefined)
      event.basicInfo.title = basicInfo.title;

    if (basicInfo.description !== undefined)
      event.basicInfo.description = basicInfo.description;
  }

  // --- OTHER INFO ---
  if (otherInfo) {
    if (!event.otherInfo) event.otherInfo = {};
    for (const key in otherInfo) {
      event.otherInfo[key] = otherInfo[key];
    }
  }

  // --- OPERATING HOURS ---
  if (operatingHours) {
    if (!event.operatingHours) event.operatingHours = {};
    for (const key in operatingHours) {
      event.operatingHours[key] = operatingHours[key];
    }
  }

  // --- PROMOTION ---
  if (promotion) {
    if (!event.promotion) event.promotion = {};
    for (const key in promotion) {
      event.promotion[key] = promotion[key];
    }
  }

  // --- SIMPLE FIELDS ---
  if (status !== undefined) event.status = status;
  if (venues !== undefined) event.venues = venues;
  if (image !== undefined) event.image = image;
  if (tags !== undefined) event.basicInfo.tags = tags;

  // --- DESCRIPTION (legacy support) ---
  if (description !== undefined) {
    if (!event.otherInfo) event.otherInfo = {};
    event.otherInfo.description = description;
  }

  // --- TITLE (legacy support) ---
  if (title !== undefined) {
    if (!event.basicInfo) event.basicInfo = {};
    event.basicInfo.title = title;
  }

  // --- SCHEDULE ---
  if (schedule) {
    if (!event.schedule) event.schedule = {};
    if (schedule.type !== undefined) event.schedule.type = schedule.type;
    if (schedule.startDateTime !== undefined)
      event.schedule.startDateTime = schedule.startDateTime;
    if (schedule.endDateTime !== undefined)
      event.schedule.endDateTime = schedule.endDateTime;
    if (schedule.recurringDetails !== undefined)
      event.schedule.recurringDetails = schedule.recurringDetails;
  }

  await event.save();
  return event;
};



const deleteEvent = async (id) => {
  const updated = await eventRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getEventDetails = async (id, timezone) => {
  const event = await eventRepo.findEventById(id);
  let data = formatEventResponse(event, { timezone });
  return data
};

const cloneEvent = async (id) => {
  const event = await eventRepo.findEventById(id);
  if (!event) return null;

  const clonedData = JSON.parse(JSON.stringify(event));
  delete clonedData._id; // Remove the original ID
  clonedData.status = "inactive"; // Set status to inactive for the clone

  return await eventRepo.createEvent(clonedData);
};

const getEventIdByNanoid = async (nanoid) => {
  const event = await eventRepo.findEventByNanoid(nanoid);
  return event ? event._id : null;
};

module.exports = {
  createEvent,
  getEvents,
  getEventIdByNanoid,
  cloneEvent,
  updateEvent,
  deleteEvent,
  getPublicEvents,
  getEventDetails,
  updateEventsWithVenueLocation
};
