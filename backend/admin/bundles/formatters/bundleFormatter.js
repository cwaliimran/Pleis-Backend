const { convertUtcToTimezone } = require("@utils/responseUtil"); // assume you have this util

const formatBundle = (bundle, options = {}) => {
  if (!bundle) return null;

  let obj = typeof bundle.toObject === "function" ? bundle.toObject() : bundle;

  const { timezone = "UTC" } = options;

  // Convert dates to timezone
  if (obj.startDate) obj.startDate = convertUtcToTimezone(obj.startDate, timezone, "YYYY-MM-DD hh:mm A");
  if (obj.endDate) obj.endDate = convertUtcToTimezone(obj.endDate, timezone, "YYYY-MM-DD hh:mm A");

  // Process bundle details arrays
  obj.bundleDetails = obj.bundleDetails || {};
  obj.bundleDetails.ticketings = obj.bundleDetails.ticketings?.map((t) => ({
    ...t,
    quantity: t.quantity || 1
  })) || [];

  obj.bundleDetails.reservations = obj.bundleDetails.reservations?.map((r) => ({
    ...r,
    quantity: r.quantity || 1
  })) || [];

  obj.bundleDetails.preOrderItems = obj.bundleDetails.preOrderItems?.map((p) => ({
    ...p,
    quantity: p.quantity || 1,
    menuItem: p.menuItem // You can expand this if menuItem has media
  })) || [];
  
  return obj;
};

module.exports = { formatBundle };
