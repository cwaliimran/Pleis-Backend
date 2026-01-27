
const { convertUtcToTimezoneAMPM } = require("@utils/responseUtil");
const moment = require('moment');

function userReservationFormatterAdjustDates(item, timezone) {
  if (!item) return null;

  let doc;
  try {
    doc = item.toObject ? item.toObject() : JSON.parse(JSON.stringify(item));
  } catch {
    doc = { ...item };
  }

  // -----------------------------
  // FORMAT BOOKED TIMING SLOT ONLY
  // -----------------------------
  if (doc.timingSlots && doc.timingSlots.dateTimeSlots) {
    const dateTimeSlots = Array.isArray(doc.timingSlots.dateTimeSlots)
      ? doc.timingSlots.dateTimeSlots
      : [doc.timingSlots.dateTimeSlots];

    dateTimeSlots.forEach(slot => {
      if (slot.date) {
        slot.date = moment(slot.date).format("YYYY-MM-DD");
      }

      if (Array.isArray(slot.timeSlots)) {
        slot.timeSlots.forEach(timeSlot => {
          let { startTime, endTime } = timeSlot;

          if (startTime instanceof Date) {
            startTime = startTime.toISOString();
          } else if (
            typeof startTime === "string" &&
            moment(startTime, "hh:mm A", true).isValid()
          ) {
            startTime = moment(startTime, "hh:mm A").toISOString();
          }

          if (endTime instanceof Date) {
            endTime = endTime.toISOString();
          } else if (
            typeof endTime === "string" &&
            moment(endTime, "hh:mm A", true).isValid()
          ) {
            endTime = moment(endTime, "hh:mm A").toISOString();
          }

          timeSlot.startTime = convertUtcToTimezoneAMPM(startTime, timezone);
          timeSlot.endTime = convertUtcToTimezoneAMPM(endTime, timezone);
        });
      }
    });
  }

  // -----------------------------
  // NORMALIZE USER SHAPE + TIER
  // -----------------------------
  const {
    userId,
    firstName,
    lastName,
    phoneNumber,
    tier,
    ...rest
  } = doc;

  return {
    ...rest,
    user: {
      _id: userId,
      firstName,
      lastName,
      phoneNumber,
      tier
    }
  };
}


module.exports = { userReservationFormatterAdjustDates };