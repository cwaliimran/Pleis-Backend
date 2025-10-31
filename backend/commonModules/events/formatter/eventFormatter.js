const { getFullImageUrl } = require("../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("../../../helperUtils/responseUtil");
const { transformOperatingHoursToLocal } = require("../../../shared/commonSchemas/operatingHours");

/**
 * Formats an event document into a public-friendly JSON response.
 * Handles populated fields, media URLs, and timezone-aware date conversion.
 *
 * @param {Object} eventObject - Mongoose doc or plain object
 * @param {Object} options - optional settings: { timezone, includeFields, excludeFields }
 */
const formatEventResponse = (eventObject, options = {}) => {
  if (!eventObject) return null;

  const { timezone = "UTC", includeFields = [], excludeFields = [] } = options;

  // Convert Mongoose document to plain object
  const event = JSON.parse(JSON.stringify(eventObject));

  // ---------- BASIC INFO ----------
  const basicInfo = {
    title: event.basicInfo?.title || "",
    description: event.basicInfo?.description || "",
    venueLocation: event.basicInfo?.venueLocation || null,
    mediaInfo: event.basicInfo?.mediaInfo || {
      name: event.basicInfo?.media?.name || "",
      type: event.basicInfo?.media?.type || "image",
      url: getFullImageUrl(event.basicInfo?.media?.name),
    },
    partnerOrganizer: event.basicInfo?.partnerOrganizer || null,
  };

  // ---------- ORGANIZATION ----------
  if (event.basicInfo?.organization) {
    const org = event.basicInfo.organization;

    basicInfo.organization = {
      _id: org._id,
      basicInfo: {
        name: org.basicInfo?.name || "",
        socialLinks: org.basicInfo?.socialLinks || {},
        mediaInfo: {
          logo: org.basicInfo?.mediaInfo?.logo || getFullImageUrl(org.basicInfo?.media?.logo),
          cover: org.basicInfo?.mediaInfo?.cover || getFullImageUrl(org.basicInfo?.media?.cover),
        },
      },
      location: org.location || null,
      otherInfo: {
        description: org.otherInfo?.description || "",
        minAge: org.otherInfo?.minAge || null,
        tags: (org.otherInfo?.tags || []).map((t) => ({
          _id: t._id,
          title: t.title,
        })),
        categories: (org.otherInfo?.categories || []).map((c) => ({
          _id: c._id,
          title: c.title,
          imageInfo: c.imageInfo || {
            name: c.image || "",
            url: getFullImageUrl(c.image),
          },
        })),
        galleryMediaInfo: (org.otherInfo?.galleryMediaInfo || []).map((g) => ({
          name: g.name,
          url: getFullImageUrl(g.name),
        })),
      },
      operatingHours: transformOperatingHoursToLocal(org?.operatingHours, timezone),
    };
  }

  // ---------- VENUE ----------
  if (event.basicInfo?.venue) {
    const venue = event.basicInfo.venue;
    basicInfo.venue = {
      _id: venue._id,
      title: venue.title,
      location: venue.location,
      floorPlan: venue.floorPlan || "",
      floorPlanInfo: venue.floorPlan
        ? {
          name: venue.floorPlan,
          url: getFullImageUrl(venue.floorPlan),
        }
        : null,
    };
  }

  // ---------- CATEGORIES & TAGS ----------
  basicInfo.categories = (event.basicInfo?.categories || []).map((cat) => ({
    _id: cat._id,
    title: cat.title,
    imageInfo: cat.imageInfo || {
      name: cat.image || "",
      url: getFullImageUrl(cat.image),
    },
  }));

  basicInfo.tags = (event.basicInfo?.tags || []).map((tag) => ({
    _id: tag._id,
    title: tag.title,
  }));

  // ---------- SCHEDULE ----------
  const schedule = {
    type: event.schedule?.type || "oneTime",
    startDateTime: event.schedule?.startDateTime
      ? convertUtcToTimezone(event.schedule.startDateTime, timezone, "YYYY-MM-DD hh:mm A")
      : "",
    endDateTime: event.schedule?.endDateTime
      ? convertUtcToTimezone(event.schedule.endDateTime, timezone, "YYYY-MM-DD hh:mm A")
      : "",
    recurringDetails: event.schedule?.recurringDetails || null,
  };

  // ---------- META ----------
  const meta = {
    revenue: event.meta?.revenue || 0,
    views: event.meta?.views || 0,
    region: event.meta?.region || "",
    favoritesCount: event.meta?.favoritesCount || 0,
    attendeesCount: event.meta?.attendeesCount || 0,
  };

  // ---------- FINAL EVENT STRUCTURE ----------
  const formattedEvent = {
    _id: event._id,
    basicInfo,
    schedule,
    meta,
    creator: event.creator,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };

  // ---------- FIELD FILTERING ----------
  if (includeFields.length > 0) {
    const filtered = {};
    includeFields.forEach((field) => {
      if (formattedEvent[field]) filtered[field] = formattedEvent[field];
    });
    return filtered;
  }

  if (excludeFields.length > 0) {
    excludeFields.forEach((fieldPath) => {
      const [mainField, subField] = fieldPath.split(".");
      if (subField && formattedEvent[mainField]) {
        delete formattedEvent[mainField][subField];
      } else {
        delete formattedEvent[fieldPath];
      }
    });
  }

  return formattedEvent;
};

module.exports = {
  formatEventResponse,
};
