const { calculateDistance } = require("../../../helperUtils/calculateDistance");
const { getFullImageUrl } = require("../../../helperUtils/imageHelper");
const { convertUtcToTimezone } = require("@utils/responseUtil");

/**
 * Formats an event document into a public-friendly JSON response.
 * Handles populated fields, media URLs, and timezone-aware date conversion.
 *
 * @param {Object} object - Mongoose doc or plain object
 * @param {Object} options - optional settings: { timezone, includeFields, excludeFields }
 */
const formatPublicHighlightResponse = (object = {}, options = {}) => {
  if (!object) return null;
  let highlightObject = typeof object.toObject === "function" ? object.toObject() : object;
  if (!highlightObject) return null;
  const { userLocation } = options;


  // Always attach root-level media if present
  if (highlightObject.media && highlightObject.media.name) {
    highlightObject.media = getFullImageUrl(highlightObject.media.name);
  }

  if (highlightObject.object?.basicInfo?.media) {
    if (highlightObject.type === "organization") {
      // Organization: logo and cover
      const orgMedia = highlightObject.object.basicInfo.organization?.media ;
      if (orgMedia) {
        highlightObject.object.basicInfo.organization.media = {
          logo: getFullImageUrl(orgMedia.logo),
          cover: getFullImageUrl(orgMedia.cover),
        };
      }
    } else {
      // Event: type and name
      const embeddedMedia = highlightObject.object.basicInfo.media;
      if (embeddedMedia) {
        highlightObject.object.basicInfo.media = getFullImageUrl(embeddedMedia.name || embeddedMedia);
      }

      // Attach organization logo and cover with baseurl if present
      const org = highlightObject.object.basicInfo.organization;
      if (org?.basicInfo?.media) {
        org.basicInfo.media.logo = getFullImageUrl(org.basicInfo.media?.logo);
      }
      // Calculate distance if both venueLocation and userLocation exist
      if (
        highlightObject.object.basicInfo?.venueLocation?.coordinates &&
        userLocation?.coordinates
      ) {
        highlightObject.object.distance = calculateDistance(
          ...highlightObject.object.basicInfo.venueLocation.coordinates,
          ...userLocation.coordinates
        );
      }
    }
  }
  return highlightObject;
};


module.exports = {
  formatPublicHighlightResponse,
};
