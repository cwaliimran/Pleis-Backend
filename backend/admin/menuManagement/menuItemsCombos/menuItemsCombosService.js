const menuItemsComboRepo = require("./menuItemsCombosRepository");
const {
  formatMenuItemsCombo,
  formatMenuItemsComboList,
} = require("./formatter/formatMenuItemsCombos");
const { PriceMode } = require("@MenuItemsCombosModel");

const createMenuItemsCombo = async (data) => {
  const ownership = await menuItemsComboRepo.assertMenuItemsBelongToCompanyOrganizer(
    data.menuItems,
    data.creator,
  );
  if (!ownership.ok) {
    return { error: ownership.error };
  }

  const doc = await menuItemsComboRepo.createMenuItemsCombo(data);
  const populated =
    await menuItemsComboRepo.findMenuItemsComboByIdWithMenus(doc._id);
  return formatMenuItemsCombo(populated);
};

const getMenuItemsCombos = async ({
  page,
  limit,
  keyword,
  status,
  subCategory,
  priceMode,
  date,
  sortBy,
  sortOrder,
  creator,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const { combos, meta } = await menuItemsComboRepo.getMenuItemsCombos({
    page,
    limit,
    keyword,
    status,
    subCategory,
    priceMode,
    date,
    skip,
    sortBy,
    sortOrder,
    creator,
  });

  return {
    combos: formatMenuItemsComboList(combos),
    meta,
  };
};

const getMenuItemsComboDetails = async (id) => {
  const combo = await menuItemsComboRepo.findMenuItemsComboByIdWithMenus(id);
  if (!combo) return null;
  return formatMenuItemsCombo(combo);
};

const updateMenuItemsCombo = async (id, data) => {
  const combo = await menuItemsComboRepo.findMenuItemsComboById(id);
  if (!combo) return null;

  const allowedFields = [
    "name",
    "subCategory",
    "description",
    "menuItems",
    "priceMode",
    "price",
    "status",
  ];

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    const [enriched] = await menuItemsComboRepo.attachApplicableMenus([combo]);
    return formatMenuItemsCombo(enriched);
  }

  if (updateData.menuItems) {
    const ownership =
      await menuItemsComboRepo.assertMenuItemsBelongToCompanyOrganizer(
        updateData.menuItems,
        combo.creator,
      );
    if (!ownership.ok) {
      return { error: ownership.error };
    }
  }

  const finalPriceMode = updateData.priceMode ?? combo.priceMode;
  const finalPrice =
    updateData.price !== undefined ? updateData.price : combo.price;

  if (
    finalPriceMode === PriceMode.PERCENTAGE_OFF_SUM &&
    (Number(finalPrice) <= 0 || Number(finalPrice) > 100)
  ) {
    return { error: "invalid_percentage_off_sum_value" };
  }

  if (Number(finalPrice) < 0) {
    return { error: "invalid_price_value" };
  }

  Object.assign(combo, updateData);
  await combo.save();

  const updated =
    await menuItemsComboRepo.findMenuItemsComboByIdWithMenus(id);
  return formatMenuItemsCombo(updated);
};

const deleteMenuItemsCombo = async (id) => {
  const updated = await menuItemsComboRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createMenuItemsCombo,
  getMenuItemsCombos,
  getMenuItemsComboDetails,
  updateMenuItemsCombo,
  deleteMenuItemsCombo,
};
