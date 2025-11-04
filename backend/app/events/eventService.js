// services/eventService.js

const { getCurrentDateInTimezone, convertUtcToTimezone, generateMeta } = require("../../helperUtils/responseUtil");
const eventRepo = require("./eventRepository");
const _ = require("lodash");
const { getRecommendedEvents } = require("./recommendationSystem/eventsRecommender");
const Organizations = require("../../commonModules/organizations/Organization");
const { formatEventResponse } = require("../../commonModules/events/formatter/eventFormatter");
const { formatMoreFromOrganizerEventResponse } = require("./formatter/recommendedEventFormatter");


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
            "schedule.endDateTime": { $gte: now },
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
    const formattedEvents = events.map((event) => {
      console.log(event.basicInfo.organization)
      const formatted = formatEventResponse(event, { timezone });

      // Attach rounded distance
      if (event.distance !== undefined && event.distance !== null) {
        const dist = Number(event.distance);
        if (Number.isFinite(dist)) {
          formatted.distance = Math.round(dist * 100) / 100;
        }
      }

      return formatted;
    });
    let meta = generateMeta(page, limit, totalFiltered);
    return {
      events: formattedEvents,
      meta
    };
  } catch (error) {
    throw new Error(`Failed to fetch nearby events: ${error.message}`);
  }
};

const getEventDetails = async (userLocation, userId, id, timezone) => {
  const event = await eventRepo.findEventById(id);
  const now = getCurrentDateInTimezone({ timezone });

  const announcements = {
    updates: [
      {
        "title": "Early Bird Tickets",
        "description": "This is a sample update for the event.",
        "date": "2024-10-01 10:00 AM"
      },
      {
        "title": "Entertainment",
        "description": "Live performances by top artists.",
        "date": "2024-10-05 02:00 PM"
      }
    ],
    giveaways: [],
  };

  const ticketDetails = {
    image: "https://example.com/event-ticket.png",
    options: [
      {
        "title": "Early Bird",
        "price": "€50",
        "available": 30
      },
      {
        "title": "Promo Price",
        "price": "€40",
        "available": 50
      },
      {
        "title": "Standard",
        "price": "€60",
        "available": 10
      },
    ]
  }
  // TODO 
  const loyaltyPrograms = []

  const similarEvents = await getRecommendedEvents(id, {
    page: 1,
    limit: 10,
  });


  let moreFromOrganizer = await eventRepo.getMoreFromOrganizerEvents(userId, {
    _id: { $ne: event._id },
    "basicInfo.organization": event.basicInfo?.organization,
    status: "active",
    "schedule.endDateTime": { $gte: now },
  }, 1, 10);

  moreFromOrganizer = moreFromOrganizer.map(e => formatMoreFromOrganizerEventResponse(e, { userLocation, timezone }));

  let data = {
    event: formatEventResponse(event, { timezone }),
    announcements,
    ticketDetails,
    loyaltyPrograms,
    similarEvents,
    moreFromOrganizer,
  };
  return data
};


const getEventIdByNanoid = async (nanoid) => {
  const event = await eventRepo.findEventByNanoid(nanoid);
  return event ? event._id : null;
};

module.exports = {
  getEventIdByNanoid,
  getNearbyEvents,
  getEventDetails,
};
