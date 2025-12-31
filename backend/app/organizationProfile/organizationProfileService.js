
const mongoose = require("mongoose");
const { transformOperatingHoursToLocal } = require("../../shared/commonSchemas/operatingHours");
const { findOrganizationById, findEventsByOrganization, countEventsByOrganization, getOrganizationMenuWithItems, getRecommendedOrganizations, getNearbyOrganizations, getSuggestedLoyaltyClubsForUser, getOrganizationsGroupedByVenueTypesRepo, getForYouOrganizationsForHomeRepo, getTrendingOrganizationsForHomeRepo, getSuggestedLoyaltyClubsForHome, getNewlyListedOrganizationsRepo, getOrganizationsGroupedByTagsRepo } = require("./organizationProfileRepository");
const { getCurrentDateInTimezone, generateMeta, convertUtcToTimezone } = require("../../helperUtils/responseUtil");
const { calculateDistance } = require("../../helperUtils/calculateDistance");
const { Favorites } = require("../../commonModules/favorites/Favorite");
const { formatMenuItem } = require("../../commonModules/menuManagement/menuItems/formatter/formatMenuItems");
const { formatEventResponse } = require("../events/formatter/eventFormatter");
const { formatOrganization, formatNearByOrganization } = require("../../commonModules/organizations/formatter/formatOrganization");
const { isClubMember } = require("../loyalty/clubMembers/clubMembersRepository");
const { formatSuggestedClub } = require("../loyalty/clubMembers/formatters/formatSuggestedClubs");
const { logEngagementService } = require("@appEngagement/engagementEventsService");
const Reservations = require("@ReservationsModel");
const { getOrganizationReservationsService } = require("../reservations/reservationService");
const Reviews = require("@ReviewsModel");
const formatLoyaltyListing = require("./formater/formateImage");



/**
 * Get formatted organization profile
 */
const getOrganizationProfile = async (queryData) => {
  try {
    const { organizationId, filter = "upcoming", timezone, userId } = queryData || {};

    // Log engagement
    void logEngagementService({
      entityType: "organizations",
      entityId: organizationId,
      action: "view",
      userId
    }).catch(console.error);

    // Fetch data using Promise.all for concurrency
    const [
      orgProfile,
      orgEvents,
      reservations,
      menu,
      loyaltyPrograms,
      reviews,
      similarOrganizations
    ] = await Promise.all([
      findOrganizationById(userId, organizationId),
      getOrganizationEvents({ organizationId, filter, timezone, userLocation: queryData.userLocation, userId }), // Filter for "upcoming" or "past"
      getOrganizationReservationsService({ organizationId, timezone }),
      getOrganizationMenu(organizationId, timezone),
      getOrganizationLoyaltyPrograms(organizationId),
      getOrganizationReviews(organizationId), // Get reviews with reviewer names
      getSimilarOrganizations(organizationId)
    ]);

    if (!orgProfile.org) {
      throw new Error("Organization not found");
    }

    // Format organization profile info
    let orgProfileInfo = formatOrganization(orgProfile.org);

    // Check if the user is a club member
    let member = await isClubMember(userId, orgProfileInfo.creator);
    orgProfileInfo.isClubMember = member ? true : false;

    // Set favorite status and venue information
    orgProfileInfo.isFavorite = orgProfile.isFavorite;
    orgProfileInfo.venue = orgProfile.orgVenue;

    // Remove floor plan from venue info if present
    delete orgProfileInfo?.venue?.floorPlan;

    // Localize operating hours
    if (orgProfileInfo.operatingHours) {
      orgProfileInfo.operatingHours = transformOperatingHoursToLocal(
        orgProfileInfo.operatingHours,
        timezone
      );
    }

    // Return the final result with all the data
    return {
      status: true,
      result: {
        data: {
          orgProfileInfo,
          orgEvents: orgEvents.result,
          reservations,
          menu,
          loyaltyPrograms,
          reviews,  // Include reviews with reviewer names
          similarOrganizations
        }
      }
    };
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

const { getFullImageUrl } = require("../../helperUtils/imageHelper"); // Import getFullImageUrl

const getOrganizationReviews = async (organizationId) => {
  try {
    // Fetch active reviews and populate the user field with firstName, lastName, and profileIcon
    const reviews = await Reviews.find({ organization: organizationId, status: "active" })
      .populate('user', 'firstName lastName profileIcon location')  // Populate the user with name and profile icon
      .exec();

    // Calculate the average rating
    const totalRatings = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = reviews.length > 0 ? totalRatings / reviews.length : 0;

    // Modify the profileIcon directly in the review object and return reviews
    const reviewsWithReviewerInfo = reviews.map(review => {
      // Directly modify the profileIcon field of the user object
      review.user.profileIcon = getFullImageUrl(review.user.profileIcon || "noimage.png"); // Format profileIcon directly

      return {
        ...review.toObject(),  // Convert Mongoose document to plain JavaScript object
      };
    });

    return { averageRating, reviews: reviewsWithReviewerInfo };  // Return both average rating and reviews
  } catch (error) {
    console.error("Error fetching reviews:", error);
    throw new Error("Error fetching reviews");
  }
};




//you might also like
const getSimilarOrganizations = async (organizationId) => {
  let result = await getRecommendedOrganizations(organizationId);
  return result || [];
};

const getNearbyOrganizationsService = async ({ category, userLocation, radiusKm, timezone, page, limit, userId }) => {
  let result = await getNearbyOrganizations({ category, userLocation, radiusKm, timezone, page, limit, userId });
  result.organizations = result.organizations.map(org => formatNearByOrganization(org, timezone));

  return result
};

const getSuggestedLoyaltyClubs = async ({ page = 1, limit = 10, userId, keyword }) => {
  let { result, meta } = await getSuggestedLoyaltyClubsForUser({ page, limit, userId, keyword });
  const formatted = result.map(club => formatSuggestedClub(club));

  return {
    formatted: formatted || [],
    meta
  };
};

const getSuggestedLoyaltyClubsForHomeService = async ({ page = 1, limit = 10, userId, userLocation,
  radiusKm = 50 }) => {
  let result = await getSuggestedLoyaltyClubsForHome({
    page, limit, userId, userLocation,
    radiusKm
  });
  const formatted = result.map(club => formatSuggestedClub(club));

  return formatted || [];
};

const getForYouOrganizationsForHomeService = async ({
  category,
  userLocation,
  radiusKm,
  timezone,
  page,
  limit,
  skip,
  userId,
}) => {
  const filters = [];

  // Base status filter
  filters.push({ status: { $ne: "deleted" } });

  const organizations = await getForYouOrganizationsForHomeRepo({
    category,
    page,
    limit,
    skip,
    userLocation,
    radiusKm,
    timezone,
    userId
  }
  );


  let formattedOrganizations = organizations.map(org => formatNearByOrganization(org, timezone));
  return {
    organizations: formattedOrganizations,
  };

};

const getTrendingOrganizationsForHomeService = async ({
  category,
  userLocation,
  radiusKm = 50,
  timezone,
  page = 1,
  limit = 10,
  userId
}) => {
  const organizations = await getTrendingOrganizationsForHomeRepo({
    category,
    userLocation,
    radiusKm,
    timezone,
    page,
    limit,
    userId
  });

  let formattedOrganizations = organizations.map(org => formatNearByOrganization(org, timezone));
  return {
    organizations: formattedOrganizations,
  };
};

const getNewlyListedOrganizationsService = async ({
  category,
  userLocation,
  radiusKm = 50,
  page = 1,
  limit = 10,
  skip = 0,
  timezone,
}) => {

  const organizations = await getNewlyListedOrganizationsRepo({
    category,
    userLocation,
    radiusKm,
    page,
    limit,
    skip
  });

  const formattedOrganizations = organizations.map(org =>
    formatNearByOrganization(org, timezone)
  );

  return {
    organizations: formattedOrganizations
  };
};

const getOrganizationsGroupedByTagsService = async ({
  userLocation,
  radiusKm,
  timezone,
  userId,
  category
}) => {
  const results = await getOrganizationsGroupedByTagsRepo({
    userLocation,
    radiusKm,
    limitPerTag: 10,
    category
  });

  if (!Array.isArray(results)) return [];

  return results.map(group => ({
    key: "customCategory",
    title: group.title,
    data: (group.objects || []).map(org => {
      const formattedOrg = formatOrganization(org, { timezone, userId });
      return {
        ...formattedOrg,
        type: "Organizations"
      };
    })
  }));
};



module.exports = {
  getOrganizationEvents,
  getOrganizationProfile,
  getNearbyOrganizationsService,
  getSuggestedLoyaltyClubs,
  getForYouOrganizationsForHomeService,
  getTrendingOrganizationsForHomeService,
  getSuggestedLoyaltyClubsForHomeService,
  getNewlyListedOrganizationsService,
  getOrganizationsGroupedByTagsService
};
