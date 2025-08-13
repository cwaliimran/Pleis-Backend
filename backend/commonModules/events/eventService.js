// services/eventService.js

const eventRepo = require("./eventRepository");

const createEvent = async ({ data }) => {
  return await eventRepo.createEvent(data);
};

const getEvents = async ({ page, limit, keyword, status, creator }) => {
  const query = {};
  if (creator) query.creator = creator;
  if (status) query.status = status;
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
      eventRepo.countEvents({}),
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
    pinned,
    image,
    tags,
    description,
    title,
  } = data;

  // ✅ Safe assignment logic
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

  if (status !== undefined) event.status = status;
  if (venues !== undefined) event.venues = venues;
  if (location !== undefined) event.location = location;
  if (pinned !== undefined) event.pinned = pinned;
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

module.exports = {
  createEvent,
  getEvents,
  cloneEvent,
  updateEvent,
  deleteEvent,
  getPublicEvents,
  getEventDetails,
};
