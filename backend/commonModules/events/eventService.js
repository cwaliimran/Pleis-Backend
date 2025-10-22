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

const getNearbyEvents = async ({
  longitude,
  latitude,
  radiusKm = 50,
  page = 1,
  limit = 10,
  timezone = "Asia/Karachi"
}) => {
  // Validate coordinates
  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    throw new Error('Valid user longitude and latitude are required');
  }

  if (radiusKm <= 0) {
    throw new Error('Radius must be greater than 0');
  }

  const radiusInMeters = radiusKm * 1000;
  const now = new Date();
  const skip = Math.max(0, (page - 1) * limit);

  try {
    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          key: "basicInfo.venueLocation", // <- Important!
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: {
            status: "active",
            "schedule.startDateTime": { $gte: now },
          },
        },
      },
      {
        $lookup: {
          from: "venues",
          localField: "basicInfo.venue",
          foreignField: "_id",
          as: "basicInfo.venue",
        }
      },
      { $unwind: "$basicInfo.venue" },
      { $sort: { distance: 1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];

    const events = await eventRepo.aggregateEvents(pipeline);

    // Count total without skip/limit
    const totalCountPipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          key: "basicInfo.venueLocation", // <-- Include here too
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: {
            status: "active",
            "schedule.startDateTime": { $gte: now },
          },
        },
      },
      { $count: "total" },
    ];


    const totalResult = await eventRepo.aggregateEvents(totalCountPipeline);
    const totalFiltered = totalResult[0]?.total || 0;

    return {
      events,
      meta: {
        page,
        limit,
        total: totalFiltered,
        radiusKm,
        userLocation: {
          lng: longitude,
          lat: latitude,
        },
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch nearby events: ${error.message}`);
  }
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


module.exports = {
  createEvent,
  getEvents,
  cloneEvent,
  getNearbyEvents,
  updateEvent,
  deleteEvent,
  getPublicEvents,
  getEventDetails,
  updateEventsWithVenueLocation
};
