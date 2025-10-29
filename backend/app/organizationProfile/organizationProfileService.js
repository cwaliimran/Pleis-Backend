
const Organizations = require("../../commonModules/organizations/Organization");
const mongoose = require("mongoose");
const { transformOperatingHoursToLocal } = require("../../shared/commonSchemas/operatingHours");
const { findOrganizationById, findEventsByOrganization, countEventsByOrganization } = require("./organizationProfileRepository");
const { getCurrentDateInTimezone, generateMeta, convertUtcToTimezone } = require("../../helperUtils/responseUtil");
const { Events } = require("../../commonModules/events/Event");
const { calculateDistance } = require("../../helperUtils/calculateDistance");



/**
 * Get formatted organization profile
 */
const getOrganizationProfile = async (queryData) => {
  try {
    const { organizationId, timezone } = queryData || {};

    const [org, orgEvents, reservations, menu, loyaltyPrograms, reviews, similarOrganizations] = await Promise.all([
      findOrganizationById(organizationId),
      getOrganizationEvents({ organizationId, filter: "upcoming", timezone, userLocation: queryData.userLocation }),
      getOrganizationReservations(organizationId),
      getOrganizationMenu(organizationId),
      getOrganizationLoyaltyPrograms(organizationId),
      getOrganizationReviews(organizationId),
      getSimilarOrganizations(organizationId),
    ])
    if (!org) {
      throw new Error("Organization not found");
    }

    // Use schema helper for formatting
    let orgProfileInfo = org.formatResponse();

    // Localize operating hours
    if (orgProfileInfo.operatingHours) {
      orgProfileInfo.operatingHours = transformOperatingHoursToLocal(
        orgProfileInfo.operatingHours,
        timezone
      );
    }

    return { status: true, result: { data: { orgProfileInfo, orgEvents: orgEvents.result, reservations, menu, loyaltyPrograms, reviews, similarOrganizations } } };
  } catch (error) {
    throw new Error(`Failed to fetch organization profile: ${error.message}`);
  }
};


/**
 * Fetch organization events with filter for past or upcoming
 * @param {Object} queryData - includes organizationId, filter ("past" or "upcoming"), and timezone
 */
const getOrganizationEvents = async (queryData) => {
  try {
    let { page, limit } = queryData || {};
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;
    const { organizationId, filter, timezone } = queryData || {};

    const now = getCurrentDateInTimezone({ timezone });

    // Determine filter condition for events
    let timeFilter = {};
    if (filter === "upcoming") {
      timeFilter = { "schedule.startDateTime": { $gte: now } };
    } else if (filter === "past") {
      timeFilter = { "schedule.endDateTime": { $lt: now } };
    }

    let organizationObjectId = new mongoose.Types.ObjectId(organizationId);

    const [events, pastUpcomingMeta] = await Promise.all([
      findEventsByOrganization(organizationObjectId, timeFilter, skip, limit),
      countEventsByOrganization(organizationObjectId, now),
    ]);

    // Format for public output
    let formatted = events.map((event) => {
      const formattedEvent = new Events(event).toPublicJSON();

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

      let distance = calculateDistance(
        event.basicInfo.venue.location.coordinates[1],
        event.basicInfo.venue.location.coordinates[0],
        queryData.userLocation?.coordinates[1],
        queryData.userLocation?.coordinates[0]
      );
      if (distance !== null) {
        formattedEvent.distance = distance;
      } else {
        formattedEvent.distance = null;
      }

      return formattedEvent;
    });


    let totalFiltered = (pastUpcomingMeta.upcoming || 0) + (pastUpcomingMeta.past || 0);


    return {
      status: true, result: {
        data: formatted,
        meta: generateMeta(page, limit, totalFiltered),
        pastUpcomingMeta
      }
    };
  } catch (error) {
    throw new Error(`Failed to fetch organization events: ${error.message}`);
  }
};

const getOrganizationReservations = async (organizationId) => {
  // Placeholder for future implementation
  return [];
};

const getOrganizationMenu = async (organizationId) => {
  // Placeholder for future implementation
  return [];
};

//loyalty
const getOrganizationLoyaltyPrograms = async (organizationId) => {
  // Placeholder for future implementation
  return [];
};

//reviews
const getOrganizationReviews = async (organizationId) => {
  // Placeholder for future implementation
  return [];
};

//you might also like
const getSimilarOrganizations = async (organizationId) => {
  // Placeholder for future implementation
  return [];
};

module.exports = {
  getOrganizationEvents,
  getOrganizationProfile,
};
