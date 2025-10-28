
const Organizations = require("../../commonModules/organizations/Organization");
const { getCurrentDateInTimezone, convertUtcToTimezone, generateMeta } = require("../../helperUtils/responseUtil");
const mapsRepo = require("./mapsRepository");
const moment = require("moment-timezone");
const mongoose = require("mongoose");
const { Events } = require("../../commonModules/events/Event");
const { transformOperatingHoursToLocal } = require("../../shared/commonSchemas/operatingHours");


const getEvents = async (queryData) => {
  let {
    category,
    filter = {}, // e.g. { type: "events", key: "live" } //  key = live, today, thisWeek
    longitude = 0,
    latitude = 0,
    page = 1,
    limit = 10,
    timezone = "Asia/Karachi",
    radiusKm = 0,
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
      // default: future events only
      dateFilter = { "schedule.startDateTime": { $gte: now } };
      break;
  }


  try {
    const categoryObjId = new mongoose.Types.ObjectId(category);
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
            ...dateFilter,
            ...(category ? { "basicInfo.categories": { $in: [categoryObjId] } } : {}),
          },
        },
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

    const events = await mapsRepo.aggregateEvents(pipeline);

    // Count total (same filter)
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
            ...dateFilter,
            ...(category ? { "basicInfo.categories": { $in: [categoryObjId] } } : {}),
          },
        },
      },
      { $count: "total" },
    ];

    const totalResult = await mapsRepo.aggregateEvents(totalCountPipeline);
    const totalFiltered = totalResult[0]?.total || 0;

    // Format output
    const formattedEvents = events.map((event) => {
      const formattedEvent = new Events(event).toPublicJSON(event);
      delete formattedEvent.basicInfo.venueLocation;
      delete formattedEvent.basicInfo.partnerOrganizer;

      if (formattedEvent.schedule?.startDateTime) {
        formattedEvent.schedule.startDateTime = convertUtcToTimezone(
          formattedEvent.schedule.startDateTime,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
      }
      if (formattedEvent.schedule?.endDateTime) {
        formattedEvent.schedule.endDateTime = convertUtcToTimezone(
          formattedEvent.schedule.endDateTime,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
      }

      if (Number.isFinite(formattedEvent.distance)) {
        formattedEvent.distance = Math.round(formattedEvent.distance * 100) / 100;
      }

      if (formattedEvent.basicInfo?.organization) {
        const orgData = formattedEvent.basicInfo.organization;
        delete orgData.basicInfo.socialLinks;
        formattedEvent.basicInfo.organization = new Organizations().formatResponse(orgData);
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
    const formattedPlaces = organizations.map((org) => {
      let formatted = new Organizations().formatResponse(org);

      // Round distance
      if (Number.isFinite(org.distance)) {
        formatted.distance = Math.round(org.distance * 100) / 100;
      }

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
