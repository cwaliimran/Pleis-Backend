const moment = require("moment");
const { convertUtcToTimezone } = require("@utils/responseUtil");

const formatDaypartTimes = (daypart, timezone) => {
  const item = daypart.toObject ? daypart.toObject() : { ...daypart };

  if (item.isAllDay || !timezone) return item;

  const dateStr = moment.utc(item.createdAt).format("YYYY-MM-DD");

  if (item.startTime) {
    item.startTime = convertUtcToTimezone(
      `${dateStr}T${item.startTime}:00.000Z`,
      timezone,
      "HH:mm",
    );
  }
  if (item.endTime) {
    item.endTime = convertUtcToTimezone(
      `${dateStr}T${item.endTime}:00.000Z`,
      timezone,
      "HH:mm",
    );
  }

  return item;
};
module.exports = formatDaypartTimes;
