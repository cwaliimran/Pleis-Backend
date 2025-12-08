
const mongoose = require("mongoose");
const { transformOperatingHoursToLocal } = require("../../shared/commonSchemas/operatingHours");
const { findOrganizationById, findEventsByOrganization, countEventsByOrganization, getOrganizationMenuWithItems, getRecommendedOrganizations, getNearbyOrganizations, getSuggestedLoyaltyClubsForUser, getOrganizationsGroupedByVenueTypesRepo } = require("./organizationProfileRepository");
const { getCurrentDateInTimezone, generateMeta, convertUtcToTimezone } = require("../../helperUtils/responseUtil");
const { calculateDistance } = require("../../helperUtils/calculateDistance");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const { formatMenuItem } = require("../../commonModules/menuManagement/menuItems/formatter/formatMenuItems");
const { formatEventResponse } = require("../events/formatter/eventFormatter");
const { formatOrganization, formatNearByOrganization } = require("../../commonModules/organizations/formatter/formatOrganization");
const { isClubMember } = require("../loyalty/clubMembers/clubMembersRepository");
const { formatSuggestedClubOrganization } = require("../../commonModules/organizations/formatter/formatSuggestedClubs");
// const { addOrUpdateRecentlyViewedItem } = require("backend/app/recentlyViewed/recentlyViewedItemService");



/**
 * Get formatted organization profile
 */
const getOrganizationProfile = async (queryData) => {
  try {
    const { organizationId, filter = "upcoming", timezone, userId } = queryData || {};

    const [orgProfile, orgEvents, reservations, menu, loyaltyPrograms, reviews, similarOrganizations] = await Promise.all([
      findOrganizationById(userId, organizationId),
      getOrganizationEvents({ organizationId, filter, timezone, userLocation: queryData.userLocation, userId }), //filter: "upcoming" or "past"
      getOrganizationReservations(organizationId),
      getOrganizationMenu(organizationId, timezone),
      getOrganizationLoyaltyPrograms(organizationId),
      getOrganizationReviews(organizationId),
      getSimilarOrganizations(organizationId),
    ])

    if (!orgProfile.org) {
      throw new Error("Organization not found");
    }

    // Use schema helper for formatting
    let orgProfileInfo = formatOrganization(orgProfile.org);
    let member = await isClubMember(userId, orgProfileInfo.creator);
    orgProfileInfo.isClubMember = member ? true : false;

    orgProfileInfo.isFavorite = orgProfile.isFavorite;
    orgProfileInfo.venue = orgProfile.orgVenue;

    delete orgProfileInfo?.venue?.floorPlan

    // Localize operating hours
    if (orgProfileInfo.operatingHours) {
      orgProfileInfo.operatingHours = transformOperatingHoursToLocal(
        orgProfileInfo.operatingHours,
        timezone
      );
    }

    //TODO enable
    // addOrUpdateRecentlyViewedItem(userId, organizationId, 'organization'); // Run in background, don't await

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
    let { page, limit, userId, organizationId, filter, timezone, userLocation } = queryData || {};
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;


    const now = getCurrentDateInTimezone({ timezone });
    // Determine time filter
    let timeFilter = {};
    if (filter === "upcoming") {
      timeFilter = { "schedule.endDateTime": { $gte: now } };
    } else if (filter === "past") {
      timeFilter = { "schedule.endDateTime": { $lt: now } };
    }

    const organizationObjectId = new mongoose.Types.ObjectId(organizationId);

    // Fetch events + counts concurrently
    const [events, pastUpcomingMeta, favorites] = await Promise.all([
      findEventsByOrganization(organizationObjectId, timeFilter, skip, limit),
      countEventsByOrganization(organizationObjectId, now),
      Favorites.find({ user: userId, targetType: "event" }).select("targetId"),
    ]);

    // 🔍 Get all favorite event IDs for this user
    let favoriteEventIds = [];
    if (userId) {
      favoriteEventIds = favorites.map((f) => f.targetId.toString());
    }
    // Format events
    const formatted = events.map((event) => {
      const formattedEvent = formatEventResponse(event, { timezone });

      // Calculate distance
      if (event.basicInfo?.venue?.location?.coordinates && userLocation?.coordinates) {
        const distance = calculateDistance(
          event.basicInfo.venue.location.coordinates[1],
          event.basicInfo.venue.location.coordinates[0],
          userLocation.coordinates[1],
          userLocation.coordinates[0]
        );
        formattedEvent.distance = distance;
      } else {
        formattedEvent.distance = null;
      }

      // ✅ Add isFavorite flag
      formattedEvent.isFavorite = favoriteEventIds.includes(event._id.toString());

      return formattedEvent;
    });

    const totalFiltered = (pastUpcomingMeta.upcoming || 0) + (pastUpcomingMeta.past || 0);

    return {
      status: true,
      result: {
        data: formatted,
        meta: generateMeta(page, limit, totalFiltered),
        pastUpcomingMeta,
      },
    };
  } catch (error) {
    throw new Error(`Failed to fetch organization events: ${error.message}`);
  }
};


const getOrganizationReservations = async (organizationId) => {
  // Placeholder for future implementation
  return [];
};

const getOrganizationMenu = async (organizationId, timezone) => {
  let result = await getOrganizationMenuWithItems(organizationId);
  const formatted = result.map(menu => ({
    ...menu,
    items: menu.items.map(item => formatMenuItem(item, timezone)),
  }));
  return formatted || [];
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
  let result = await getRecommendedOrganizations(organizationId);
  return result || [];
};

const getNearbyOrganizationsService = async ({ location, radiusKm, timezone, page, limit, userId }) => {
  let result = await getNearbyOrganizations({ location, radiusKm, timezone, page, limit, userId });
  result.organizations = result.organizations.map(org => formatNearByOrganization(org));

  return result
};

const getSuggestedLoyaltyClubs = async ({ page = 1, limit = 10, userId }) => {
  let result = await getSuggestedLoyaltyClubsForUser({ page, limit, userId });
  const formatted = result.map(org => formatSuggestedClubOrganization(org));
  return formatted || [];
};

const organizationsByVenueTypeService = async ({ location, radiusKm, timezone, page, limit, userId }) => {
  let result = await getOrganizationsGroupedByVenueTypesRepo({ location, radiusKm, timezone, page, limit, userId });


  if (!Array.isArray(result)) return [];

  return result.map(group => ({
    ...group,
    data: Array.isArray(group.data)
      ? group.data.map(org => formatNearByOrganization(org))
      : [],
  }));

  return result
}

module.exports = {
  getOrganizationEvents,
  getOrganizationProfile,
  getNearbyOrganizationsService,
  getSuggestedLoyaltyClubs,
  organizationsByVenueTypeService,
};
