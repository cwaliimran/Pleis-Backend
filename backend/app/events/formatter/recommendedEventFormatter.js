const { getFullImageUrl } = require("../../../helperUtils/imageHelper");
const { calculateDistance } = require("../../../helperUtils/calculateDistance");
const { formatEventSchedule } = require("../../../commonModules/events/formatter/eventFormatter");

/**
 * Formats an event document into a public-friendly JSON response.
 * Handles populated fields, media URLs, and timezone-aware date conversion.
 *
 * @param {Object} eventObject - Mongoose doc or plain object
 * @param {Object} options - optional settings: { timezone, includeFields, excludeFields }
 */
const formatMoreFromOrganizerEventResponse = (eventObject, options = {}) => {
  if (!eventObject) return null;


  const { userLocation, timezone } = options;

  // Convert Mongoose document to plain object
  const event = JSON.parse(JSON.stringify(eventObject));

  // Only mutate/format fields that need formatting, keep rest as is
  if (event.basicInfo) {
    // Format media
    if (event.basicInfo.media) {
      event.basicInfo.media = getFullImageUrl(event.basicInfo.media.name);
    }
    // Calculate distance if both venueLocation and userLocation exist
    if (event.basicInfo.venueLocation?.coordinates && userLocation?.coordinates) {
      event.distance = calculateDistance(
        ...event.basicInfo.venueLocation.coordinates,
        ...userLocation.coordinates
      );
    }
    // Format organization if present
    if (event.basicInfo.organization) {
      const org = event.basicInfo.organization;
      event.basicInfo.organization = {
        _id: org._id,
        basicInfo: {
          name: org.basicInfo?.name || "",
          media: {
            logo: getFullImageUrl(org.basicInfo?.media?.logo),
          },
        },
      };
    }
  }


  // Format schedule
  event.schedule = formatEventSchedule(event.schedule, timezone);
  delete event.basicInfo.venueLocation;
  event.ticketInfo = {
    price: "€40"
  }

  return event;
};



module.exports = {
  formatMoreFromOrganizerEventResponse,
};
