const {
  utcMinutesToLocalTime,
} = require("../../../../shared/commonSchemas/operatingHours");

/**
 * Converts stored UTC minutes → local "HH:mm" for API responses.
 * Leaves isAllDay dayparts with null times.
 */
const formatDaypartTimes = (daypart, timezone) => {
  const item = daypart.toObject ? daypart.toObject() : { ...daypart };

  if (item.isAllDay) {
    item.startTime = null;
    item.endTime = null;
    return item;
  }

  if (!timezone) return item;

  if (item.startTime != null) {
    item.startTime = utcMinutesToLocalTime(item.startTime, timezone);
  }
  if (item.endTime != null) {
    item.endTime = utcMinutesToLocalTime(item.endTime, timezone);
  }

  return item;
};

module.exports = formatDaypartTimes;
