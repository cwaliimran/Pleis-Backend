// services/eventService.js

const { validateParams } = require("../../helperUtils/responseUtil");
const eventRepo = require("./eventRepository");

const createEvent = async ({ data }) => {
  return await eventRepo.createEvent(data);
};

const getEvents = async ({ page, limit, keyword, status, creator, startDate, endDate, organization }) => {
  const query = {};
  if (creator) query.creator = creator;
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
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

  const [events, totalFiltered, total, active, inactive] =
    await Promise.all([
      eventRepo.getEventsWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      eventRepo.countEvents(query),
      eventRepo.countEvents({ status: { $ne: "deleted" } }),
      eventRepo.countEvents({ status: "active" }),
      eventRepo.countEvents({ status: "inactive" }),
    ]);

  return {
    events,
    meta: {
      page,
      limit,
      total: totalFiltered,
      tagsCount: { total, active, inactive },
    },
  };
};

const getPublicEvents = async ({ page, limit, keyword }) => {
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

const updateEvent = async (id, data) => {
  const event = await eventRepo.findEventById(id);
  if (!event) return null;

  const {
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    venues,
    location,
    image,
    tags,
    description,
    title,
    schedule,
    promotion,
  } = data;

  if (basicInfo) {
    event.basicInfo = {
      ...event.basicInfo,
      ...basicInfo,
      media: {
        ...event.basicInfo.media,
        ...(basicInfo.media || {})
      },
      socialLinks: {
        ...event.basicInfo.socialLinks,
        ...(basicInfo.socialLinks || {})
      }
    };
  }

  if (otherInfo) {
    event.otherInfo = {
      ...event.otherInfo,
      ...otherInfo
    };
  }

  if (operatingHours) {
    event.operatingHours = {
      ...event.operatingHours,
      ...operatingHours
    };
  }

  if (promotion) {
    event.promotion = {
      ...event.promotion,
      ...promotion
    };
  }

  if (status !== undefined) event.status = status;
  if (venues !== undefined) event.venues = venues;
  if (location !== undefined) event.location = location;
  if (image !== undefined) event.image = image;
  if (tags !== undefined) event.tags = tags;
  if (description !== undefined) {
    if (!event.otherInfo) event.otherInfo = {};
    event.otherInfo.description = description;
  }
  if (title !== undefined) {
    if (!event.basicInfo) event.basicInfo = {};
    event.basicInfo.name = title;
  }

  if (schedule !== undefined) {
    if (!event.schedule) event.schedule = {};
    event.schedule = {
      ...event.schedule,
      ...schedule
    };
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
  if (!event) return null;
  return event;
};

const cloneEvent = async (id) => {
  const event = await eventRepo.findEventById(id);
  if (!event) return null;

  const clonedData = JSON.parse(JSON.stringify(event));
  delete clonedData._id; // Remove the original ID
  clonedData.status = "inactive"; // Set status to inactive for the clone

  return await eventRepo.createEvent(clonedData);
};

const getPromotedEventsByFilters = async (limit) => {
  const query = {
    status: "active",
    "promotion.isPromoted": true,
    // "schedule.startDateTime": { $gte: new Date() } // Upcoming events only
  };

  const events = await eventRepo.getEventsWithFilters(
    query,
    0,
    limit
  );

  return events;
};


module.exports = {
  createEvent,
  getEvents,
  cloneEvent,
  updateEvent,
  deleteEvent,
  getPublicEvents,
  getEventDetails,
  getPromotedEventsByFilters,
};
