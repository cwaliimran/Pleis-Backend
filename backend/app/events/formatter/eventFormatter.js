const { getFullImageUrl } = require("../../../helperUtils/imageHelper");
const { calculateDistance } = require("../../../helperUtils/calculateDistance");
const { convertUtcToTimezone } = require("../../../helperUtils/responseUtil");
const { transformOperatingHoursToLocal } = require("../../../shared/commonSchemas/operatingHours");

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



// Utility function to format schedule
function formatEventSchedule(scheduleObj, timezone, format = "YYYY-MM-DD hh:mm A") {
  if (!scheduleObj) return {};
  const type = scheduleObj.type || "oneTime";
  const formattedSchedule = {
    type,
    startDateTime: scheduleObj.startDateTime
      ? convertUtcToTimezone(scheduleObj.startDateTime, timezone, format)
      : "",
    endDateTime: scheduleObj.endDateTime
      ? convertUtcToTimezone(scheduleObj.endDateTime, timezone, format)
      : "",
  };

  formattedSchedule.recurringDetails = scheduleObj?.recurringDetails || null;
  if (formattedSchedule.recurringDetails && formattedSchedule.recurringDetails.endDate) {
    formattedSchedule.recurringDetails.endDate = convertUtcToTimezone(
      formattedSchedule.recurringDetails.endDate,
      timezone,
      "YYYY-MM-DD"
    );
  }

  return formattedSchedule;
}


const formatEventResponse = (eventObject, options = {}) => {
  let event = typeof eventObject.toObject === "function" ? eventObject.toObject() : eventObject;

  if (!event) return null;

  const { timezone = "UTC", includeFields = [], excludeFields = [] } = options;

  // Update media URLs in-place
  if (event.basicInfo?.media?.name) {
    event.basicInfo.media = getFullImageUrl(event.basicInfo.media.name);
  }

  // Organization media and operating hours
  if (event.basicInfo?.organization) {
    const org = event.basicInfo.organization;
    if (org.basicInfo?.media) {
      if (org.basicInfo.media.logo)
        org.basicInfo.media.logo = getFullImageUrl(org.basicInfo.media.logo);
      if (org.basicInfo.media.cover)
        org.basicInfo.media.cover = getFullImageUrl(org.basicInfo.media.cover);
    }
    if (Array.isArray(org.otherInfo?.categories)) {
      org.otherInfo.categories.forEach((c) => {
        if (c.image) c.image = getFullImageUrl(c.image);
      });
    }
    if (Array.isArray(org.otherInfo?.galleryMedia)) {
      org.otherInfo.galleryMedia.forEach((g) => {
        if (g.name) g.url = getFullImageUrl(g.name);
      });
    }
    if (org.operatingHours) {
      org.operatingHours = transformOperatingHoursToLocal(org.operatingHours, timezone);
    }
  }

  // Venue floor plan
  if (event.basicInfo?.venue?.floorPlan) {
    event.basicInfo.venue.floorPlan = getFullImageUrl(event.basicInfo.venue.floorPlan);
  }

  // Categories images
  if (
    Array.isArray(event.basicInfo?.categories) &&
    typeof event.basicInfo.categories[0] === "object" &&
    event.basicInfo.categories[0] !== null
  ) {
    event.basicInfo.categories.forEach((cat) => {
      if (cat.image) cat.image = getFullImageUrl(cat.image);
    });
  }

  // Schedule formatting
  if (event.schedule) {
    event.schedule = formatEventSchedule(event.schedule, timezone);
  }

  // Attach rounded distance
  if (event.distance !== undefined && event.distance !== null) {
    const dist = Number(event.distance);
    if (Number.isFinite(dist)) {
      event.distance = {
        distance: Math.round(dist * 100) / 100,
        unit: "km"
      }
    }
  }

  // Field filtering
  let result = event;
  if (includeFields.length > 0) {
    result = {};
    includeFields.forEach((field) => {
      if (event[field] !== undefined) result[field] = event[field];
    });
    return result;
  }

  if (excludeFields.length > 0) {
    excludeFields.forEach((fieldPath) => {
      const [mainField, subField] = fieldPath.split(".");
      if (subField && result[mainField]) {
        delete result[mainField][subField];
      } else {
        delete result[fieldPath];
      }
    });
  }



  return result;
};

module.exports = {
  formatEventSchedule,
  formatMoreFromOrganizerEventResponse,
  formatEventResponse,
};
