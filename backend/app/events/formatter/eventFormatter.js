const { getFullImageUrl } = require("../../../helperUtils/imageHelper");
const { calculateDistance } = require("../../../helperUtils/calculateDistance");
const { convertUtcToTimezone, convertUtcToTimezoneAMPM } = require("../../../helperUtils/responseUtil");
const { transformOperatingHoursToLocal } = require("../../../shared/commonSchemas/operatingHours");
const moment = require("moment-timezone");

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
      // Convert galleryMedia items to direct URL strings
      org.otherInfo.galleryMedia = org.otherInfo.galleryMedia.map((item) => {
        if (typeof item === "string") {
          return getFullImageUrl(item);
        } else if (item && typeof item === "object" && item.name) {
          return getFullImageUrl(item.name);
        }
        return item;
      });
    }
    if (org.operatingHours) {
      org.operatingHours = transformOperatingHoursToLocal(org.operatingHours, timezone);
    }
  }

  if (event.basicInfo?.partnerOrganization) {
    const org = event.basicInfo.partnerOrganization;
    if (org.basicInfo?.media) {
      if (org.basicInfo.media.logo)
        org.basicInfo.media.logo = getFullImageUrl(org.basicInfo.media.logo);
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
  // FORMAT Mongo $geoNear distance (meters → km)
  if (typeof event.distance === "number") {
    const km = event.distance / 1000;

    event.distance = {
      distance: Math.round(km * 100) / 100, // 2 decimals
      unit: "km"
    };
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
/**
 * Attach venue type titles to event.basicInfo.venue
 * @param {Object} event - Original event object
 * @param {Array} venueTypeTitles - Array of venue type titles
 * @returns {Object} - Event with added venueTypeTitles
 */
const attachVenueTypesToEvent = (event, venueTypeTitles = []) => {
  if (!event) return event;

  const plainEvent = event.toObject ? event.toObject() : event;

  // Ensure venue object exists
  if (!plainEvent.basicInfo?.venue) {
    plainEvent.basicInfo = plainEvent.basicInfo || {};
    plainEvent.basicInfo.venue = {};
  }

  // Attach venueTypeTitles
  plainEvent.basicInfo.venue.venueTypeTitles = venueTypeTitles;

  return plainEvent;
};
function reservationsFormatterAdjustDates(reservations, timezone) {
  if (!reservations) {
    console.log("No reservations found.");
    return [];
  }

  const list = Array.isArray(reservations)
    ? reservations
    : Object.values(reservations); // Convert object to array

  const currentDate = moment().tz(timezone).startOf('day');  // Get today's date in the provided timezone
  console.log("Current Date in Timezone:", currentDate.format("YYYY-MM-DD"));  // Log today's date

  // Filter out records that only have _id field and no other data
  const filteredReservations = list.filter((item) => {
    if (!item) return false; // Exclude null or invalid entries

    const cat = item.toObject ? item.toObject() : { ...item };

    // Check if the object has only the _id field
    if (Object.keys(cat).length === 1 && cat._id) {
      console.log("Excluding item with only _id:", cat._id);  // Log the exclusion of this record
      return false;  // Exclude the record
    }

    // Further filtering to ensure empty dateTimeSlots are excluded
    if (cat.timingSlots?.dateTimeSlots && cat.timingSlots.dateTimeSlots.length === 0) {
      console.log("Excluding item with empty dateTimeSlots:", cat._id);
      return false;  // Exclude the record if no valid dateTimeSlots are present
    }

    return true;  // Keep the record if it has valid data
  });

  console.log("Filtered Reservations (after excluding empty _id only records and empty dateTimeSlots):", filteredReservations);

  return filteredReservations.map((item) => {
    if (!item) return null;

    const cat = item.toObject ? item.toObject() : { ...item };

    // Adjust timingSlots and dateTimeSlots
    if (cat.timingSlots?.dateTimeSlots) {
      const dateTimeSlots = Array.isArray(cat.timingSlots.dateTimeSlots)
        ? cat.timingSlots.dateTimeSlots
        : [cat.timingSlots.dateTimeSlots];

      console.log("Processing dateTimeSlots:", dateTimeSlots);  // Log the dateTimeSlots

      // Filter out past dates and empty dateTimeSlots
      const filteredSlots = dateTimeSlots.filter((slot) => {
        if (slot.date) {
          const slotDate = moment(slot.date).tz(timezone).startOf('day');  // Convert the slot date to start of day in the provided timezone
          console.log("Checking slot date:", slot.date, "Converted to:", slotDate.format("YYYY-MM-DD"));
          return slotDate.isSameOrAfter(currentDate) && slot.timeSlots?.length > 0;  // Keep only today and future dates, and non-empty time slots
        }
        return false;  // If there's no date, filter out
      });

      console.log("Filtered Slots (after filtering past dates and empty time slots):", filteredSlots);

      // Update the dateTimeSlots with filtered results
      cat.timingSlots.dateTimeSlots = filteredSlots;

      // For each remaining date block, adjust time slots
      filteredSlots.forEach((slot) => {
        if (slot.date) {
          // Convert date to the specified timezone
          slot.date = convertUtcToTimezone(slot.date, timezone, "YYYY-MM-DD");
          console.log("Converted Slot Date:", slot.date);  // Log the converted date
        }

        // Convert times
        if (Array.isArray(slot.timeSlots)) {
          slot.timeSlots.forEach((timeSlot) => {
            if (timeSlot.startTime) {
              timeSlot.startTime = convertUtcToTimezoneAMPM(timeSlot.startTime, timezone);
              console.log("Converted Start Time:", timeSlot.startTime);  // Log the converted start time
            }
            if (timeSlot.endTime) {
              timeSlot.endTime = convertUtcToTimezoneAMPM(timeSlot.endTime, timezone);
              console.log("Converted End Time:", timeSlot.endTime);  // Log the converted end time
            }
          });
        }
      });
    }

    // If no valid dateTimeSlots remain, remove the timingSlots field altogether
    if (cat.timingSlots?.dateTimeSlots.length === 0) {
      console.log("No valid dateTimeSlots remain, removing timingSlots.");
      delete cat.timingSlots;
    }

    return cat;
  }).filter(item => item !== null);  // Remove null entries from the result
}



const reservationsFormatterAdjustDates_ = (reservations, timezone) => {
  if (!reservations) return [];

  const list = Array.isArray(reservations) ? reservations : Object.values(reservations);

  return list.map((item) => {
    if (!item) return null;

    const cat = item.toObject ? item.toObject() : { ...item };

    // Adjust timingSlots and dateTimeSlots
    if (cat.timingSlots?.dateTimeSlots) {
      const dateTimeSlots = Array.isArray(cat.timingSlots.dateTimeSlots)
        ? cat.timingSlots.dateTimeSlots
        : [cat.timingSlots.dateTimeSlots];

      dateTimeSlots.forEach((slot) => {
        // Convert date to timezone if it's valid
        if (slot.date) {
          // Convert date from UTC to the specified timezone
          slot.date = moment.utc(slot.date).tz(timezone).format("YYYY-MM-DD");
        }

        // Keep timeSlots (startTime, endTime) unchanged
      });
    }

    return cat;
  });
};















module.exports = {
  formatEventSchedule,
  formatMoreFromOrganizerEventResponse,
  formatEventResponse,
  attachVenueTypesToEvent,
  reservationsFormatterAdjustDates,
  reservationsFormatterAdjustDates_
};
