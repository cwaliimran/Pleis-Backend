// services/eventService.js

const { pipeline } = require("supertest/lib/test");
const { validateParams, getCurrentDateInTimezone, convertUtcToTimezone } = require("../../helperUtils/responseUtil");
const Organizations = require("../organizations/Organization");
const eventRepo = require("./eventRepository");
const _ = require("lodash");

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

const getNearbyEvents = async (queryData) => {
  let {
    longitude = 0,
    latitude = 0,
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    radiusKm = 0,
  } = queryData || {};

  // If radiusKm is not provided, use an approximate "whole world" radius
  // (half Earth's circumference) in kilometers so geoNear covers the globe.
  const rawRadiusKm = (radiusKm === 0 || radiusKm === undefined || radiusKm === null || radiusKm === '')
    ? 20037.5
    : radiusKm;

   radiusKm = parseFloat(rawRadiusKm);
  longitude = parseFloat(longitude);
  latitude = parseFloat(latitude);

  // Validate coordinates
  if (typeof longitude !== 'number' || typeof latitude !== 'number') {
    throw new Error('Valid user longitude and latitude are required');
  }

  if (radiusKm <= 0) {
    throw new Error('Radius must be greater than 0');
  }

  const radiusInMeters = radiusKm * 1000;
  const now = getCurrentDateInTimezone({ timezone });
  const skip = Math.max(0, (page - 1) * limit);

  try {
    const pipeline = [
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [longitude, latitude],
          },
          key: "basicInfo.venueLocation",
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: {
            status: "active",
            "schedule.startDateTime": { $gte: now },
          },
        },
      },
      // Only keep schedule, basicInfo and distance from the main event document
      { $project: { schedule: 1, basicInfo: 1, distance: 1 } },

      {
        $lookup: {
          from: "venues",
          localField: "basicInfo.venue",
          foreignField: "_id",
          pipeline: [{ $project: { title: 1, location: 1 } }],
          as: "basicInfo.venue",
        },
      },
      { $unwind: "$basicInfo.venue" },

      {
        $lookup: {
          from: "organizations",
          let: { orgId: "$basicInfo.organization" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$orgId"] } } },
            { $project: { basicInfo: 1 } },
          ],
          as: "basicInfo.organization",
        },
      },
      { $unwind: { path: "$basicInfo.organization", preserveNullAndEmptyArrays: true } },

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
          key: "basicInfo.venueLocation",
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
    // Convert event dates to user's timezone and round distances to 2 decimals
    const formattedEvents = events.map(event => {
      let formattedEvent = JSON.parse(JSON.stringify(event));
      delete formattedEvent.basicInfo.venueLocation;
      delete formattedEvent.basicInfo.partnerOrganizer;



      if (formattedEvent.schedule && formattedEvent.schedule.startDateTime) {
        formattedEvent.schedule.startDateTime = convertUtcToTimezone(
          formattedEvent.schedule.startDateTime,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
      }
      if (formattedEvent.schedule && formattedEvent.schedule.endDateTime) {
        formattedEvent.schedule.endDateTime = convertUtcToTimezone(
          formattedEvent.schedule.endDateTime,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
      }

      // Round distance to 2 decimal places if present
      if (formattedEvent.distance !== undefined && formattedEvent.distance !== null) {
        const dist = Number(formattedEvent.distance);
        if (Number.isFinite(dist)) {
          formattedEvent.distance = Math.round(dist * 100) / 100;
        }
      }

      //format organization basicInfo only
      if (formattedEvent.basicInfo && formattedEvent.basicInfo.organization) {
        let orgData = formattedEvent.basicInfo.organization;
        delete orgData.basicInfo.socialLinks;
        formattedEvent.basicInfo.organization = new Organizations().formatResponse(orgData);
      }

      return formattedEvent;
    });

    return {
      events: formattedEvents,
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
