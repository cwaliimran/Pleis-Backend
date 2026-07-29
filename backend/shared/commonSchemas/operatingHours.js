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
 * Converts local time string to UTC minutes (0–1439)
 * Example: "10:00" in Asia/Karachi → 300 (05:00 UTC)
 * Accepts "HH:mm", "hh:mm A", or already-normalized minutes.
 */
function localTimeToUtcMinutes(timeStr, timezone) {
  if (timeStr === null || timeStr === undefined || timeStr === "") return null;
  if (typeof timeStr === "number") {
    if (Number.isNaN(timeStr) || timeStr < 0 || timeStr > 1439) return null;
    return timeStr;
  }
  const formats = ["HH:mm", "hh:mm A", "h:mm A"];
  const utcMoment = moment.tz(timeStr, formats, true, timezone).utc();
  if (!utcMoment.isValid()) return null;
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

/**
 * True if nowUtcMinutes falls inside [from, to], including overnight (from > to).
 */
function isWithinUtcMinutesWindow(from, to, nowUtcMinutes) {
  if (from == null || to == null || nowUtcMinutes == null) return false;

  if (from > to) {
    return nowUtcMinutes >= from || nowUtcMinutes <= to;
  }
  return nowUtcMinutes >= from && nowUtcMinutes <= to;
}

function isOrganizationOpenNow(operatingHours, timezone = "Asia/Karachi") {
  if (!operatingHours) return false;

  const { utcMinutes, localWeekdayKey } = getUtcMinutesAndLocalWeekdayKey(timezone);
  const today = operatingHours[localWeekdayKey];

  if (!today || !today.isOpen) return false;

  const nowUtcMinutes = utcMinutes;

  let { from, to, break: brk } = today;

  if (from == null || to == null) return false;

  let isOpen = isWithinUtcMinutesWindow(from, to, nowUtcMinutes);

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

/**
 * Daypart availability check — compare against restaurant/org timezone.
 * Daypart.startTime / endTime are UTC minutes (0–1439).
 */
function isDaypartActiveNow(daypart, timezone = "UTC") {
  if (!daypart) return false;
  if (daypart.isAllDay) return true;
  if (daypart.status && daypart.status !== "active") return false;

  const { utcMinutes } = getUtcMinutesAndLocalWeekdayKey(timezone);
  return isWithinUtcMinutesWindow(
    daypart.startTime,
    daypart.endTime,
    utcMinutes,
  );
}

module.exports = {
  OperatingHoursSchema,
  transformOperatingHoursToUtc,
  transformOperatingHoursToLocal,
  isOrganizationOpenNow,
  isDaypartActiveNow,
  isWithinUtcMinutesWindow,
  localTimeToUtcMinutes,
  utcMinutesToLocalTime,
  getUtcMinutesAndLocalWeekdayKey,
};
