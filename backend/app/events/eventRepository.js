// repositories/eventRepository.js

const { Events } = require("../../commonModules/events/Event");
const { getWithFilters } = require('@dbUtils/queryUtil');
const { Favorites } = require("../../commonModules/favorites/Favorite");
const  Venues  = require("@VenuesModel");
const  VenueTypes = require("@VenueTypesModel");

const  Reservations = require("@ReservationsModel");
const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const { getMinTicketPricesByEventIds } = require("../ticketing/ticketingsRepository");
// Get all with filters
const getEventsWithFilters = async (query, skip, limit) => {
  return Events.find(query)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image")
    .populate("basicInfo.tags", "title")
    .populate("basicInfo.organization", "basicInfo.name basicInfo.media otherInfo.description")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

const getMoreFromOrganizerEvents = async (userId, filter, page, limit) => {

  let events = await getWithFilters({
    model: Events,
    query: filter,
    populate: [
      {
        path: "basicInfo.organization",
        select: "basicInfo.name basicInfo.media",
      },
    ],
    options: {
      page, limit,
      select: { "basicInfo.media": 1, "basicInfo.title": 1, "basicInfo.venueLocation": 1, "basicInfo.organization": 1, schedule: 1 },
    },
  });


  // Add "favorite" flag
  if (userId && events.length > 0) {
    const eventIds = events.map((e) => e._id);
    const userFavorites = await Favorites.find({
      user: userId,
      targetType: "event",
      targetId: { $in: eventIds },
    }).select("targetId");

    const favoriteSet = new Set(userFavorites.map((f) => f.targetId.toString()));

    events = events.map((event) => ({
      ...event,
      isFavorite: favoriteSet.has(event._id.toString()),
    }));
  }

    // Fetch minimum ticket prices for all events in results
    const eventIds = events.map((e) => e._id);
    const ticketPriceMap = await getMinTicketPricesByEventIds(eventIds);

    // Attach minimum ticket price to each event
    events = events.map((event) => {
      const minPrice = ticketPriceMap[event._id.toString()] || null;
      return {
        ...event,
        ticketInfo: minPrice ? { price: `€${minPrice}` } : null,
      };
    });

  return events;

};



// Count by condition
const countEvents = async (query = {}) => {
  return Events.countDocuments(query);
};

// Find by ID
const findEventById = async (id) => {
  return Events.findById(id)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image otherInfo")
    .populate("basicInfo.tags", "title otherInfo")
    .populate({
      path: "basicInfo.organization",
      select: "basicInfo otherInfo operatingHours location",
      populate: [
        {
          path: "otherInfo.categories",
          select: "title image otherInfo",
        },
        {
          path: "otherInfo.tags",
          select: "title otherInfo",
        },
      ],
    })
    .populate({
      path: "basicInfo.partnerOrganization",
      select: "basicInfo.name otherInfo.description basicInfo.media.logo",
    });
}


// Aggregate pipeline
const aggregateEvents = async (pipeline) => {
  return Events.aggregate(pipeline)
    .option({ allowDiskUse: true }) // Optional: helpful for large datasets
    .exec();
};

const updateMany = async (filter, update) => {
  return Events.updateMany(filter, update);
};

const findEventByNanoid = async (nanoid) => {
  return Events.findOne({ publicId: nanoid }).select("_id");
}

const getVenueTypeTitles = async (venueId) => {
  if (!venueId) return [];
  const venue = await Venues.findById(venueId).select("venueType");

  if (!venue || !Array.isArray(venue.venueType) || venue.venueType.length === 0) {
    return [];
  }
  const venueTypes = await VenueTypes
    .find({ _id: { $in: venue.venueType } })
    .select("title");
  return venueTypes.map(v => v.title);
};








const getEventReservations = async (eventId) => {
  const pipeline = [
    {
      $match: {
        optionalEventId: eventId,
        status: { $ne: "deleted" }   // ignore deleted reservations
      }
    },
    {
      $project: {
        timingSlots: 1,
      }
    }
  ];

  const reservations = await Reservations.aggregate(pipeline);
  return reservations;
};


const getEventsGroupedByTagsRepo = async ({
  location,
  radiusKm,
  timezone,
  limitPerTag = 10,
}) => {
  const radiusInMeters = radiusKm * 1000;
  const now = getCurrentDateInTimezone({ timezone });

  const pipeline = [
    // 1️⃣ Geo filter
    {
      $geoNear: {
        near: { type: "Point", coordinates: location },
        key: "basicInfo.venueLocation",
        distanceField: "distance",
        spherical: true,
        maxDistance: radiusInMeters,
        query: {
          status: "active",
          $or: [
            { "schedule.endDateTime": { $gte: now } },
            { "schedule.startDateTime": { $gte: now } },
          ],
        },
      },
    },
    // 2️⃣ Unwind tags
    { $unwind: "$basicInfo.tags" },
    // 3️⃣ Lookup tag details
    {
      $lookup: {
        from: "tags",
        localField: "basicInfo.tags",
        foreignField: "_id",
        as: "tag",
      },
    },
    { $unwind: "$tag" },
    // 4️⃣ Lookup organization details (populate basicInfo.organization, select basicInfo)
    {
      $lookup: {
        from: "organizations",
        localField: "basicInfo.organization",
        foreignField: "_id",
        as: "organization",
        pipeline: [
          { $project: { basicInfo: 1, _id: 1 } }
        ]
      }
    },
    {
      $addFields: {
        "basicInfo.organization": { $arrayElemAt: ["$organization", 0] }
      }
    },
    // 5️⃣ Sort nearest first
    { $sort: { distance: 1 } },
    // 6️⃣ Group by tag
    {
      $group: {
        _id: "$tag._id",
        title: { $first: "$tag.title" },
        events: { $push: "$$ROOT" },
      },
    },
    // 7️⃣ Limit events per tag
    {
      $project: {
        key: { $literal: "customCategory" },
        title: 1,
        data: { $slice: ["$events", limitPerTag] },
      },
    },
  ];

  return Events.aggregate(pipeline).allowDiskUse(true);
};



module.exports = {
  getEventsWithFilters,
  countEvents,
  aggregateEvents,
  findEventById,
  updateMany,
  findEventByNanoid,
  getMoreFromOrganizerEvents,
  getVenueTypeTitles,
  getEventReservations,
  getEventsGroupedByTagsRepo,
};
