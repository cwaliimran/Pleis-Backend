const { default: mongoose } = require("mongoose");
const moment = require("moment-timezone");

/* 
Use numeric UTC minutes (simpler + faster queries)
This is ideal if we’ll be doing lots of $gte / $lte comparisons.
*/
const timingSchema = new mongoose.Schema(
  {
    from: { type: Number, default: null },
    to: { type: Number, default: null },
    break: {
      from: { type: Number, default: null },
      to: { type: Number, default: null },
    },
    isOpen: { type: Boolean, default: false },
  },
  { _id: false }
);

const OperatingHoursSchema = new mongoose.Schema({
  monday: timingSchema,
  tuesday: timingSchema,
  wednesday: timingSchema,
  thursday: timingSchema,
  friday: timingSchema,
  saturday: timingSchema,
  sunday: timingSchema,
},
  { _id: false });



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
  if (!operatingHours) return operatingHours;

  const days = Object.keys(operatingHours);
  const converted = {};

  for (const day of days) {
    const dayData = operatingHours[day] || {};
    const from = utcMinutesToLocalTime(dayData.from, timezone);
    const to = utcMinutesToLocalTime(dayData.to, timezone);
    // If from or to is null, force isOpen to false
    const isOpen = (from !== null && to !== null) ? (dayData.isOpen ?? false) : false;
    converted[day] = {
      from,
      to,
      break: {
        from: utcMinutesToLocalTime(dayData.break?.from, timezone),
        to: utcMinutesToLocalTime(dayData.break?.to, timezone),
      },
      isOpen,
    };
  }

  return converted;
}

function getUtcMinutesAndLocalWeekdayKey(timezone = "Asia/Karachi") {
  const now = moment().tz(timezone);
  const utc = now.clone().utc();
  const utcMinutes = utc.hours() * 60 + utc.minutes();
  const localWeekdayKey = now.format("dddd").toLowerCase();
  return { utcMinutes, localWeekdayKey };
}

function isOrganizationOpenNow(operatingHours, timezone = "Asia/Karachi") {
  if (!operatingHours) return false;

  const { utcMinutes, localWeekdayKey } = getUtcMinutesAndLocalWeekdayKey(timezone);
  const today = operatingHours[localWeekdayKey];

  if (!today || !today.isOpen) return false;

  const nowUtcMinutes = utcMinutes;

  let { from, to, break: brk } = today;

  if (from == null || to == null) return false;

  // Case: normal day
  let isOpen = nowUtcMinutes >= from && nowUtcMinutes <= to;

  // Case: overnight shift (e.g. 20:00 — 03:00)
  if (from > to) {
    isOpen = nowUtcMinutes >= from || nowUtcMinutes <= to;
  }

  // Break window
  if (
    brk?.from != null &&
    brk?.to != null &&
    nowUtcMinutes >= brk.from &&
    nowUtcMinutes <= brk.to
  ) {
    isOpen = false;
  }

  return isOpen;
}



module.exports = {
  OperatingHoursSchema,
  transformOperatingHoursToUtc,
  transformOperatingHoursToLocal,
  isOrganizationOpenNow,
};
