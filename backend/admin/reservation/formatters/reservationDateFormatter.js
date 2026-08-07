// formatters/reservationDateFormatter.js

const { convertUtcToTimezone } = require("@utils/responseUtil");
const DATE_FIELDS = new Set([
  "date",
  "startTime",
  "endTime",
  "createdAt",
  "updatedAt",
  "paidAt",
  "lockUntil",
]);

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

const toPlain = (data) => {
  if (data && typeof data.toObject === "function") {
    return data.toObject({ flattenMaps: true });
  }
  if (Array.isArray(data) && typeof data.toObject === "undefined") {
    return data;
  }
  return data;
};

const formatDatesDeep = (raw, timezone, outputFormat) => {
  const data = toPlain(raw);

  if (Array.isArray(data)) {
    return data.map((item) => formatDatesDeep(item, timezone, outputFormat));
  }

  if (data instanceof Date) {
    return convertUtcToTimezone(data.toISOString(), timezone, outputFormat);
  }

  // skip ObjectId / other non-plain objects (constructor !== Object)
  if (data && typeof data === "object" && data.constructor === Object) {
    const result = {};
    for (const [key, value] of Object.entries(data)) {
      if (
        DATE_FIELDS.has(key) &&
        typeof value === "string" &&
        ISO_DATE_REGEX.test(value)
      ) {
        result[key] = convertUtcToTimezone(value, timezone, outputFormat);
      } else if (value && typeof value === "object") {
        result[key] = formatDatesDeep(value, timezone, outputFormat);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return data;
};

const formatReservationDates = (
  reservations,
  timezone,
  outputFormat = "YYYY-MM-DDTHH:mm:ss.SSSZ",
) => {
  // Strip Mongoose internals / circular refs entirely up front — safest and simplest.
  const plain = JSON.parse(JSON.stringify(reservations));
  return formatDatesDeep(plain, timezone, outputFormat);
};

module.exports = { formatReservationDates };