const { convertUtcToTimezone } = require("@utils/responseUtil"); // assume you have this util

const formatTicketingBooking = (item, options = {}) => {
  if (!item) return null;

  let obj = typeof item.toObject === "function" ? item.toObject() : item;

  const { timezone = "UTC" } = options;

  // Convert dates to timezone
  if (obj.startDate) obj.startDate = convertUtcToTimezone(obj.startDate, timezone, "YYYY-MM-DD hh:mm A");
  if (obj.endDate) obj.endDate = convertUtcToTimezone(obj.endDate, timezone, "YYYY-MM-DD hh:mm A");

  
  return obj;
};

module.exports = { formatTicketingBooking };
