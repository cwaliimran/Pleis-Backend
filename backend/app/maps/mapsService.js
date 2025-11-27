
const Organizations = require("../../commonModules/organizations/Organization");
const mapsRepo = require("./mapsRepository");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const { Events } = require("../../commonModules/events/Event");
const { transformOperatingHoursToLocal } = require("../../shared/commonSchemas/operatingHours");
const { formatEventResponse } = require("../events/formatter/eventFormatter");
const { formatOrganization } = require("../../commonModules/organizations/formatter/formatOrganization");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const { getCurrentDateInTimezone, getStartAndEndOfDay, getStartAndEndOfWeek, generateMeta } = require("../../helperUtils/responseUtil");


/* const getEvents = async (queryData) => {
  let {
    category,
    filter = {}, // e.g. { type: "events", key: "live" } //  key = live, today, thisWeek
    longitude = 0,
    latitude = 0,
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    radiusKm = 0,
    userId,
  } = queryData || {};

  const rawRadiusKm =
    radiusKm === 0 || radiusKm === undefined || radiusKm === null || radiusKm === ''
      ? 20037.5
      : radiusKm;

  radiusKm = parseFloat(rawRadiusKm);
  longitude = parseFloat(longitude);
  latitude = parseFloat(latitude);

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new Error("Valid user longitude and latitude are required");
  }
  if (radiusKm <= 0) throw new Error("Radius must be greater than 0");

  const radiusInMeters = radiusKm * 1000;
  const now = getCurrentDateInTimezone({ timezone });
  const skip = Math.max(0, (page - 1) * limit);

  // 🔹 1. Define dynamic date filter based on filter.key
  let dateFilter = {};
  const startOfToday = moment.tz(timezone).startOf("day").toDate();
  const endOfToday = moment.tz(timezone).endOf("day").toDate();
  const endOfWeek = moment.tz(timezone).endOf("week").toDate();

  switch (filter?.key) {
    case "live":
      // currently running events
      dateFilter = {
        "schedule.startDateTime": { $lte: now },
        "schedule.endDateTime": { $gte: now },
      };
      break;

    case "today":
      // events happening today
      dateFilter = {
        "schedule.startDateTime": { $gte: startOfToday, $lte: endOfToday },
      };
      break;

    case "thisWeek":
      // events happening this week
      dateFilter = {
        "schedule.startDateTime": { $gte: startOfToday, $lte: endOfWeek },
      };
      break;

    default:
      // default: events whoose endDateTime is in the future
      dateFilter = { "schedule.endDateTime": { $gte: now } };
      break;
  }


  try {
    const categoryObjId = new mongoose.Types.ObjectId(category);

    let geoNearOptions = {
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
        ...dateFilter,
        ...(category ? { "basicInfo.categories": { $in: [categoryObjId] } } : {}),
      },
    };
    const pipeline = [
      {
        $geoNear: geoNearOptions,

      },
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
      //lookup tags
      {
        $lookup: {
          from: "tags",
          localField: "basicInfo.tags",
          foreignField: "_id",
          pipeline: [{ $project: { title: 1 } }],
          as: "basicInfo.tags",
        },
      },
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

    let events = await mapsRepo.aggregateEvents(pipeline);


    // Add "favorite" flag if user is logged in
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




    // Count total (same filter)
    const totalCountPipeline = [
      {
        $geoNear: geoNearOptions,
      },
      { $count: "total" },
    ];

    const totalResult = await mapsRepo.aggregateEvents(totalCountPipeline);
    const totalFiltered = totalResult[0]?.total || 0;

    // Format output
    const formattedEvents = events.map((event) => {

      const formattedEvent = formatEventResponse(event, { timezone });
      delete formattedEvent.basicInfo.venueLocation;
      delete formattedEvent.basicInfo.partnerOrganizer;

      if (formattedEvent.basicInfo?.organization) {
        const orgData = formattedEvent.basicInfo.organization;
        delete orgData.basicInfo.socialLinks;
        formattedEvent.basicInfo.organization = formatOrganization(orgData);
      }

      return formattedEvent;
    });

    let meta = generateMeta(page, limit, totalFiltered);
    // meta.radiusKm = radiusKm;
    // meta.userLocation = { lng: longitude, lat: latitude };
    return {
      status: true,
      result: {
        data: formattedEvents,
        meta: meta,
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch nearby events: ${error.message}`);
  }
};
 */


const getEvents = async (queryData) => {
  let {
    longitude = 0,
    latitude = 0,
    keyword = "",
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    advanceFilters = {},
    userId,
    sort = "asc", // asc = oldest first, desc = latest first
  } = queryData || {};

  const {
    time,
    distanceFrom = 0,
    distanceTo = 50,
    dateFrom,
    dateTo,
    categories = [],
    venueTypes = [],
    genre = [],
    tags = [],
  } = advanceFilters;

  longitude = parseFloat(longitude);
  latitude = parseFloat(latitude);
  const distanceToMeters = distanceTo * 1000;
  const distanceFromMeters = distanceFrom * 1000;
  const skip = Math.max(0, (page - 1) * limit);
  const now = getCurrentDateInTimezone({ timezone });

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new Error("Valid user longitude and latitude are required");
  }

  // --- Time / Date Range Filter ---
  let dateFilter = {};
  if (dateFrom || dateTo) {
    const start = dateFrom ? new Date(dateFrom) : new Date("1970-01-01");
    const end = dateTo ? new Date(dateTo) : new Date("2999-12-31");
    dateFilter = {
      "schedule.startDateTime": { $lte: end },
      "schedule.endDateTime": { $gte: start },
    };
  } else if (time && time !== "all") {
    let start, end;
    switch (time) {
      case "live":
        dateFilter = { "schedule.startDateTime": { $lte: now }, "schedule.endDateTime": { $gte: now } };
        break;
      case "today":
        ({ start, end } = getStartAndEndOfDay(now, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;
      case "tomorrow":
        const tomorrow = new Date(now);
        tomorrow.setDate(now.getDate() + 1);
        ({ start, end } = getStartAndEndOfDay(tomorrow, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;
      case "thisWeek":
        ({ start, end } = getStartAndEndOfWeek(now, timezone));
        dateFilter = { "schedule.startDateTime": { $lte: end }, "schedule.endDateTime": { $gte: start } };
        break;
      default:
        dateFilter = { "schedule.endDateTime": { $gte: now } };
    }
  } else {
    dateFilter = { "schedule.endDateTime": { $gte: now } };
  }

  // --- Categories / Genre / Tags Filter ---
  const categoryFilter = categories.length
    ? { "basicInfo.categories": { $in: categories.map((id) => new mongoose.Types.ObjectId(id)) } }
    : {};
  const genreFilter = genre.length ? { "basicInfo.genre": { $in: genre } } : {};
  const tagsFilter = tags.length
    ? { "basicInfo.tags": { $in: tags.map((id) => new mongoose.Types.ObjectId(id)) } }
    : {};

  //keyword filter
  const keywordFilter = keyword && keyword.trim() !== ""
    ? {
      $or: [
        { "basicInfo.title": { $regex: keyword, $options: "i" } },
        { "basicInfo.description": { $regex: keyword, $options: "i" } },
      ],
    }
    : {};

  const combinedFilter = {
    status: "active",
    ...dateFilter,
    ...categoryFilter,
    ...genreFilter,
    ...tagsFilter,
    ...keywordFilter,
  };

  try {
    const pipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "basicInfo.venueLocation",
          distanceField: "distance",
          spherical: true,
          maxDistance: distanceToMeters,
          query: combinedFilter,
        },
      },
      ...(distanceFrom > 0 ? [{ $match: { distance: { $gte: distanceFromMeters } } }] : []),
      {
        $lookup: {
          from: "venues",
          localField: "basicInfo.venue",
          foreignField: "_id",
          as: "venue",
          pipeline: [
            { $project: { title: 1, venueType: 1, location: 1 } },
            ...(venueTypes.length
              ? [{ $match: { venueType: { $in: venueTypes.map((id) => new mongoose.Types.ObjectId(id)) } } }]
              : []),
          ],
        },
      },
      { $unwind: "$venue" },
      {
        $lookup: {
          from: "organizations",
          let: { orgId: "$basicInfo.organization" },
          pipeline: [{ $match: { $expr: { $eq: ["$_id", "$$orgId"] } } }, { $project: { basicInfo: 1 } }],
          as: "basicInfo.organization",
        },
      },
      { $unwind: { path: "$basicInfo.organization", preserveNullAndEmptyArrays: true } },
      // --- Sort by event start date ---
      { $sort: { "schedule.startDateTime": sort === "desc" ? -1 : 1 } },
      {
        $facet: {
          events: [{ $skip: skip }, { $limit: parseInt(limit) }],
          totalCount: [{ $count: "total" }],
        },
      },
    ];

    const result = await mapsRepo.aggregateEvents(pipeline);
    const events = result[0]?.events || [];
    const totalFiltered = result[0]?.totalCount[0]?.total || 0;

    // Get favorite events
    let favoriteSet = new Set();
    if (userId && events.length > 0) {
      const eventIds = events.map((e) => e._id);
      const userFavorites = await Favorites.find({
        user: userId,
        targetType: "event",
        targetId: { $in: eventIds },
      }).select("targetId");
      favoriteSet = new Set(userFavorites.map((f) => f.targetId.toString()));
    }

    const formattedEvents = events.map((event) =>
      formatEventResponse(
        { ...event, isFavorite: favoriteSet.has(event._id.toString()) },
        { timezone }
      )
    );

    const meta = generateMeta(page, limit, totalFiltered);
    return {
      status: true,
      result: {
        data: formattedEvents,
        meta,
      },
    }
  } catch (error) {
    throw new Error(`Failed to fetch nearby events: ${error.message}`);
  }
};

const getPlaces = async (queryData) => {
  let {
    category,
    filter = {}, // e.g. { type: "places", key: "openNow" }
    longitude = 0,
    latitude = 0,
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    radiusKm = 0,
    userId,
  } = queryData || {};

  const rawRadiusKm =
    radiusKm === 0 || radiusKm === undefined || radiusKm === null || radiusKm === ""
      ? 20037.5
      : radiusKm;

  radiusKm = parseFloat(rawRadiusKm);
  longitude = parseFloat(longitude);
  latitude = parseFloat(latitude);

  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new Error("Valid user longitude and latitude are required");
  }
  if (radiusKm <= 0) throw new Error("Radius must be greater than 0");

  const radiusInMeters = radiusKm * 1000;
  const skip = Math.max(0, (page - 1) * limit);

  const nowUtc = moment.utc();
  const currentMinutes = nowUtc.hours() * 60 + nowUtc.minutes();
  const currentDay = nowUtc.format("dddd").toLowerCase();
  // Dynamic filter for “places”
  let dynamicFilter = {};
  switch (filter?.key) {
    case "openNow":
      // Checks if the place is open right now
      dynamicFilter = {
        [`operatingHours.${currentDay}.isOpen`]: true,
        [`operatingHours.${currentDay}.from`]: { $lte: currentMinutes },
        [`operatingHours.${currentDay}.to`]: { $gte: currentMinutes },
      };
      break;


    // TODO: Implement these filters in future releases
    /* 
        case "topRated":
          // Placeholder — requires rating field in schema
          dynamicFilter = { "meta.rating": { $gte: 4 } };
          break;
    
        case "trending":
          // Placeholder — requires views or check-ins field
          dynamicFilter = { "meta.views": { $gte: 50 } };
          break;
     */
    default:
      dynamicFilter = {}; // No special filter
      break;
  }

  try {
    const categoryObjId = category ? new mongoose.Types.ObjectId(category) : null;
    const pipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "location",
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: {
            status: "active",
            ...(categoryObjId
              ? { "otherInfo.categories": { $in: [categoryObjId] } }
              : {}),
            ...dynamicFilter,
          },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "otherInfo.categories",
          foreignField: "_id",
          as: "otherInfo.categories",
        },
      },
      {
        $project: {
          basicInfo: 1,
          otherInfo: 1,
          operatingHours: 1,
          location: 1,
          distance: 1,
        },
      },
      { $sort: { distance: 1 } },
      { $skip: skip },
      { $limit: parseInt(limit) },
    ];


    const organizations = await Organizations.aggregate(pipeline);

    // Count total (same filter)
    const totalCountPipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [longitude, latitude] },
          key: "location",
          distanceField: "distance",
          spherical: true,
          maxDistance: radiusInMeters,
          query: {
            status: "active",
            ...(categoryObjId
              ? { "otherInfo.categories": { $in: [categoryObjId] } }
              : {}),
            ...dynamicFilter,
          },
        },
      },
      { $count: "total" },
    ];

    const totalResult = await Organizations.aggregate(totalCountPipeline);
    const totalFiltered = totalResult[0]?.total || 0;

    // Format and finalize output
    let formattedPlaces = organizations.map((org) => {
      let formatted = formatOrganization(org);
      if (formatted.operatingHours) {
        formatted.operatingHours = transformOperatingHoursToLocal(
          formatted.operatingHours,
          timezone
        );
      }

      return formatted;
    });

    let meta = generateMeta(page, limit, totalFiltered);
    // meta.radiusKm = radiusKm;
    // meta.userLocation = { lng: longitude, lat: latitude };

    //find favorites
    if (userId && formattedPlaces.length > 0) {
      const placeIds = formattedPlaces.map((p) => p._id);
      const userFavorites = await Favorites.find({
        user: userId,
        targetType: "organization",
        targetId: { $in: placeIds },
      }).select("targetId");

      const favoriteSet = new Set(userFavorites.map((f) => f.targetId.toString()));

      formattedPlaces = formattedPlaces.map((place) => ({
        ...place,
        isFavorite: favoriteSet.has(place._id.toString()),
      }));
    }


    return { status: true, result: { data: formattedPlaces, meta } };
  } catch (error) {
    throw new Error(`Failed to fetch nearby places: ${error.message}`);
  }
};


//get both events and places
const getAllData = async (queryData) => {
  try {
    const [eventsResult, placesResult] = await Promise.all([
      getEvents(queryData),
      getPlaces(queryData),
    ]);

    //don't combine data and meta separately, just combine data arrays and use events meta
    let combinedData = {};
    combinedData.events = eventsResult.result;
    combinedData.places = placesResult.result;



    return { status: true, result: { data: combinedData } };
  } catch (error) {
    throw new Error(`Failed to fetch combined data: ${error.message}`);
  }
}


module.exports = {
  getEvents,
  getPlaces,
  getAllData,
};
