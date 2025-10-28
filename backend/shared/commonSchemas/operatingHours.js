const { default: mongoose } = require("mongoose");
const moment = require("moment-timezone");

/* 
Use numeric UTC minutes (simpler + faster queries)
This is ideal if we’ll be doing lots of $gte / $lte comparisons.
*/
const timingSchema = {
  from: { type: Number, default: null }, // e.g. 480 = 08:00 UTC
  to: { type: Number, default: null }, // e.g. 1080 = 18:00 UTC
  break: {
    from: { type: Number, default: null },
    to: { type: Number, default: null },
  },
  isOpen: { type: Boolean, default: false },
};
const OperatingHoursSchema = new mongoose.Schema({
  monday: timingSchema,
  tuesday: timingSchema,
  wednesday: timingSchema,
  thursday: timingSchema,
  friday: timingSchema,
  saturday: timingSchema,
  sunday: timingSchema,
});



/**
 * Converts local "HH:mm" string to UTC minutes (0–1439)
 * Example: "10:00" in Asia/Karachi → 300 (05:00 UTC)
 */

function localTimeToUtcMinutes(timeStr, timezone) {
  if (!timeStr) return null;
  const utcMoment = moment.tz(timeStr, "HH:mm", timezone).utc();
  return utcMoment.hours() * 60 + utcMoment.minutes();
}

function transformOperatingHoursToUtc(operatingHours, timezone = "Asia/Karachi") {
  if (!operatingHours) return operatingHours;

  const days = Object.keys(operatingHours);
  const converted = {};

  for (const day of days) {
    const dayData = operatingHours[day] || {};
    converted[day] = {
      from: localTimeToUtcMinutes(dayData.from, timezone),
      to: localTimeToUtcMinutes(dayData.to, timezone),
      break: {
        from: localTimeToUtcMinutes(dayData.break?.from, timezone),
        to: localTimeToUtcMinutes(dayData.break?.to, timezone),
      },
      isOpen: dayData.isOpen ?? false,
    };
  }

  return converted;
}

//convert UTC minutes back to local "HH:mm" string
function utcMinutesToLocalTime(utcMinutes, timezone) {
  if (utcMinutes === null || utcMinutes === undefined) return null;
  const utcMoment = moment.utc().startOf('day').add(utcMinutes, 'minutes');
  const localMoment = utcMoment.tz(timezone);
  return localMoment.format("HH:mm");
}

function transformOperatingHoursToLocal(operatingHours, timezone = "Asia/Karachi") {
  console.log("operatingHours",operatingHours)
  if (!operatingHours) return operatingHours;

  const days = Object.keys(operatingHours);
  const converted = {};

  for (const day of days) {
    const dayData = operatingHours[day] || {};
    converted[day] = {
      from: utcMinutesToLocalTime(dayData.from, timezone),
      to: utcMinutesToLocalTime(dayData.to, timezone),
      break: {
        from: utcMinutesToLocalTime(dayData.break?.from, timezone),
        to: utcMinutesToLocalTime(dayData.break?.to, timezone),
      },
      isOpen: dayData.isOpen ?? false,
    };
  }

  return converted;
}

module.exports = {
  OperatingHoursSchema,
  transformOperatingHoursToUtc,
  transformOperatingHoursToLocal,
};
