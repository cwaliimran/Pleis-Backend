const { convertUtcToTimezoneAMPM } = require("@utils/responseUtil");
const moment = require('moment');

function reservationsFormatter(item, timezone) {
  if (!item) return null;

  const cat = item.toObject ? item.toObject() : { ...item };

  if (cat.timingSlots && cat.timingSlots.dateTimeSlots) {
    const dateTimeSlots = Array.isArray(cat.timingSlots.dateTimeSlots)
      ? cat.timingSlots.dateTimeSlots
      : [cat.timingSlots.dateTimeSlots];

    dateTimeSlots.forEach(slot => {
      if (slot.timeSlots && Array.isArray(slot.timeSlots)) {
        slot.timeSlots.forEach(timeSlot => {
          let startTime = timeSlot.startTime;
          let endTime = timeSlot.endTime;

          if (moment(startTime, "hh:mm A", true).isValid()) {
            startTime = moment(startTime, "hh:mm A").toISOString();
          }
          if (moment(endTime, "hh:mm A", true).isValid()) {
            endTime = moment(endTime, "hh:mm A").toISOString();
          }

          timeSlot.startTime = convertUtcToTimezoneAMPM(startTime, timezone);
          timeSlot.endTime = convertUtcToTimezoneAMPM(endTime, timezone);
        });
      }
    });
  }

  return { ...cat };
}

module.exports = { reservationsFormatter };
