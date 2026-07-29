const { convertUtcToTimezone } = require("@utils/responseUtil");

const DATE_FORMAT = "YYYY-MM-DD hh:mm A";

function formatMenuItemsDiscount(discount, timezone) {
  const obj =
    typeof discount.toObject === "function" ? discount.toObject() : discount;
  if (!obj) return null;

  if (obj.startDate) {
    obj.startDate = convertUtcToTimezone(
      obj.startDate,
      timezone,
      DATE_FORMAT,
    );
  }

  if (obj.endDate) {
    obj.endDate = convertUtcToTimezone(obj.endDate, timezone, DATE_FORMAT);
  }

  return obj;
}

function formatMenuItemsDiscountList(discounts = [], timezone) {
  return discounts.map((discount) => formatMenuItemsDiscount(discount, timezone));
}

module.exports = {
  formatMenuItemsDiscount,
  formatMenuItemsDiscountList,
};
