const { getFullImageUrl } = require("../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");
const { transformOperatingHoursToLocal } = require("../../../shared/commonSchemas/operatingHours");

/**
 * Formats an event document into a public-friendly JSON response.
 * Handles populated fields, media URLs, and timezone-aware date conversion.
 *
 * @param {Object} eventObject - Mongoose doc or plain object
 * @param {Object} options - optional settings: { timezone, includeFields, excludeFields }
 */
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

  if (type !== "oneTime") {
    formattedSchedule.recurringDetails = scheduleObj.recurringDetails || null;
  }

  return formattedSchedule;
}

module.exports = {
  formatEventResponse,
  formatEventSchedule,
};
