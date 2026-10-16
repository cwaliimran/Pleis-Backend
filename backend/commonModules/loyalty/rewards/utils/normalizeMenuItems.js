/**
 * buyMenuItemReward stores menuItem as ObjectId[] (same pattern as
 * challenge.taskMenuItem). Accept legacy single id or `menuItems` alias on write.
 */

const asMenuItemArray = (menuItem) => {
  if (menuItem == null || menuItem === "") return [];
  return (Array.isArray(menuItem) ? menuItem : [menuItem]).filter(
    (item) => item != null && item !== ""
  );
};

const getMenuItemIds = (menuItem) =>
  asMenuItemArray(menuItem).map((item) => item?._id || item).filter(Boolean);

/**
 * Normalize create/update payload so `menuItem` is always an ObjectId[].
 * Accepts `menuItem` (id | id[]) or `menuItems` (id[]).
 */
const normalizeRewardMenuItemsPayload = (data = {}) => {
  if (data.menuItem == null && data.menuItems == null) return data;

  const raw = data.menuItems != null ? data.menuItems : data.menuItem;
  const ids = getMenuItemIds(raw);

  const normalized = { ...data, menuItem: ids };
  delete normalized.menuItems;
  return normalized;
};

module.exports = {
  asMenuItemArray,
  getMenuItemIds,
  normalizeRewardMenuItemsPayload,
};
