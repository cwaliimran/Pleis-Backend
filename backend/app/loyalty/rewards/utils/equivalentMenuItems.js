const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");

const MENU_ITEM_IDENTITY_SELECT =
  "_id title image presetType creator amountQuantity status menu";

const getMenuItemIdentityKey = (item) => {
  if (!item?.presetType || !item?.title) return null;
  return `${item.presetType}::${item.title}::${item.creator || ""}::${item.amountQuantity ?? 0}`;
};

const getRewardMenuItemId = (menuItem) => menuItem?._id || menuItem;

const buildSiblingIdentityQuery = (item) => ({
  presetType: item.presetType,
  title: item.title,
  creator: item.creator,
  amountQuantity: item.amountQuantity ?? 0,
});

/**
 * Resolve buyMenuItemReward menu item + equivalents (presetType + title + creator + amountQuantity),
 * then check whether any equivalent is active on an active menu owned by the organizer.
 * When organization is provided, only menus for that organization count.
 */
const resolveBuyMenuItemRewardAvailability = async (
  menuItemRef,
  companyOrganizer,
  organization = null
) => {
  const menuItemId = getRewardMenuItemId(menuItemRef);
  if (!menuItemId) {
    return {
      menuItem: null,
      equivalentMenuItems: [],
      activeEquivalentMenuItems: [],
      isAvailableOnOrganizerActiveMenus: false,
    };
  }

  const requestedItem = await MenuItems.findById(menuItemId)
    .select(MENU_ITEM_IDENTITY_SELECT)
    .lean();

  if (!requestedItem) {
    return {
      menuItem: null,
      equivalentMenuItems: [],
      activeEquivalentMenuItems: [],
      isAvailableOnOrganizerActiveMenus: false,
    };
  }

  const identityKey = getMenuItemIdentityKey(requestedItem);
  const equivalentMenuItems = identityKey
    ? await MenuItems.find(buildSiblingIdentityQuery(requestedItem))
        .select(MENU_ITEM_IDENTITY_SELECT)
        .lean()
    : [requestedItem];

  const organizerId = companyOrganizer?._id || companyOrganizer;
  const organizationId = organization?._id || organization;
  if (!organizerId || !equivalentMenuItems.length) {
    return {
      menuItem: requestedItem,
      equivalentMenuItems,
      activeEquivalentMenuItems: [],
      isAvailableOnOrganizerActiveMenus: false,
    };
  }

  const menuIds = [
    ...new Set(
      equivalentMenuItems
        .map((item) => item.menu)
        .filter(Boolean)
        .map((id) => String(id))
    ),
  ];

  const menuQuery = {
    _id: { $in: menuIds },
    status: "active",
    creator: organizerId,
  };
  if (organizationId) {
    menuQuery.organization = { $in: [organizationId] };
  }

  const activeMenus = menuIds.length
    ? await Menus.find(menuQuery).select("_id").lean()
    : [];

  const activeMenuIds = new Set(activeMenus.map((menu) => String(menu._id)));
  const activeEquivalentMenuItems = equivalentMenuItems.filter(
    (item) => item.status === "active" && item.menu && activeMenuIds.has(String(item.menu))
  );

  return {
    menuItem: requestedItem,
    equivalentMenuItems,
    activeEquivalentMenuItems,
    isAvailableOnOrganizerActiveMenus: activeEquivalentMenuItems.length > 0,
  };
};

module.exports = {
  getMenuItemIdentityKey,
  getRewardMenuItemId,
  buildSiblingIdentityQuery,
  resolveBuyMenuItemRewardAvailability,
  MENU_ITEM_IDENTITY_SELECT,
};
