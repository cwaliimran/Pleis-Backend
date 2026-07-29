const menuItemsDiscountRepo = require("./menuItemsDiscountsRepository");
const {
  formatMenuItemsDiscount,
  formatMenuItemsDiscountList,
} = require("./formatter/formatMenuItemsDiscounts");
const { buildOverlapWarning } = require("@MenuItemsDiscountsModel");

const createMenuItemsDiscount = async (data, timezone) => {
  const overlapping = await menuItemsDiscountRepo.findOverlappingActiveDiscounts({
    menuItemIds: data.menuItems,
    startDate: data.startDate,
    endDate: data.endDate,
  });

  const doc = await menuItemsDiscountRepo.createMenuItemsDiscount(data);
  const populated = await menuItemsDiscountRepo.findMenuItemsDiscountById(doc._id);
  const formatted = formatMenuItemsDiscount(populated, timezone);

  return {
    ...formatted,
    overlapWarning: buildOverlapWarning(overlapping),
  };
};

const getMenuItemsDiscounts = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  type,
  companyOrganizer,
  date,
  sortBy,
  sortOrder,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const { discounts, meta } = await menuItemsDiscountRepo.getMenuItemsDiscounts({
    page,
    limit,
    keyword,
    status,
    type,
    companyOrganizer,
    date,
    skip,
    sortBy,
    sortOrder,
  });

  return {
    discounts: formatMenuItemsDiscountList(discounts, timezone),
    meta,
  };
};

const getMenuItemsDiscountDetails = async (id, timezone) => {
  const discount = await menuItemsDiscountRepo.findMenuItemsDiscountById(id);
  if (!discount) return null;
  return formatMenuItemsDiscount(discount, timezone);
};

const updateMenuItemsDiscount = async (id, data, timezone) => {
  const discount = await menuItemsDiscountRepo.findMenuItemsDiscountById(id);
  if (!discount) return null;

  const allowedFields = [
    "name",
    "type",
    "value",
    "menuItems",
    "startDate",
    "endDate",
    "status",
    "menu",
    "companyOrganizer",
  ];

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return formatMenuItemsDiscount(discount, timezone);
  }

  const finalStartDate = updateData.startDate ?? discount.startDate;
  const finalEndDate = updateData.endDate ?? discount.endDate;
  if (finalEndDate <= finalStartDate) {
    return { error: "end_date_must_be_after_start_date" };
  }

  Object.assign(discount, updateData);
  await discount.save();

  const overlapping = await menuItemsDiscountRepo.findOverlappingActiveDiscounts({
    menuItemIds: discount.menuItems,
    startDate: discount.startDate,
    endDate: discount.endDate,
    excludeDiscountId: id,
  });

  const updated = await menuItemsDiscountRepo.findMenuItemsDiscountById(id);
  const formatted = formatMenuItemsDiscount(updated, timezone);

  return {
    ...formatted,
    overlapWarning: buildOverlapWarning(overlapping),
  };
};

const deleteMenuItemsDiscount = async (id) => {
  const updated = await menuItemsDiscountRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createMenuItemsDiscount,
  getMenuItemsDiscounts,
  getMenuItemsDiscountDetails,
  updateMenuItemsDiscount,
  deleteMenuItemsDiscount,
};
