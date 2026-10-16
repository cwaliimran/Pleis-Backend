const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");
const PresetType = require("@PresetTypeModel");
const {
  asMenuItemArray,
  getMenuItemIds,
} = require("../../../../commonModules/loyalty/rewards/utils/normalizeMenuItems");

const MENU_ITEM_IDENTITY_SELECT =
  "_id title image presetType creator amountQuantity status menu";

const getPresetTypeId = (presetType) =>
  presetType?._id || presetType || null;

const getMenuItemIdentityKey = (item) => {
  const presetTypeId = getPresetTypeId(item?.presetType);
  if (!presetTypeId || !item?.title) return null;
  return `${presetTypeId}::${item.title}::${item.creator || ""}::${item.amountQuantity ?? 0}`;
};

const getRewardMenuItemId = (menuItem) => menuItem?._id || menuItem;

const buildSiblingIdentityQuery = (item) => ({
  presetType: getPresetTypeId(item.presetType),
  title: item.title,
  creator: item.creator,
  amountQuantity: item.amountQuantity ?? 0,
});

/** Attach `{ _id, name }` on presetType for response payloads. */
const attachPresetTypeNames = async (items = []) => {
  const list = items.filter(Boolean);
  if (!list.length) return;

  const ids = [
    ...new Set(
      list
        .map((item) => getPresetTypeId(item.presetType))
        .filter(Boolean)
        .map(String)
    ),
  ];
  if (!ids.length) return;

  const docs = await PresetType.find({ _id: { $in: ids } })
    .select("name")
    .lean();
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));

  for (const item of list) {
    const id = getPresetTypeId(item.presetType);
    if (id && byId.has(String(id))) {
      item.presetType = byId.get(String(id));
    }
  }
};

const emptyAvailability = () => ({
  menuItem: [],
  equivalentMenuItems: [],
  activeEquivalentMenuItems: [],
  isAvailableOnOrganizerActiveMenus: false,
});

/**
 * Resolve buyMenuItemReward menu item(s) + equivalents (presetType + title + creator + amountQuantity),
 * then check whether any equivalent is active on an active menu owned by the organizer.
 * When organization is provided, only menus for that organization count.
 *
 * `menuItemRef` may be a single id/doc or an array (multi-item rewards).
 * Response `menuItem` is always an array of the configured/requested items.
 */
const resolveBuyMenuItemRewardAvailability = async (
  menuItemRef,
  companyOrganizer,
  organization = null
) => {
  const refs = asMenuItemArray(menuItemRef);
  const requestedIds = getMenuItemIds(refs);

  if (!requestedIds.length) {
    return emptyAvailability();
  }

  const requestedItems = await MenuItems.find({ _id: { $in: requestedIds } })
    .select(MENU_ITEM_IDENTITY_SELECT)
    .lean();

  if (!requestedItems.length) {
    return emptyAvailability();
  }

  // Preserve configured order when possible
  const byId = new Map(requestedItems.map((item) => [String(item._id), item]));
  const orderedRequested = requestedIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean);

  const identityKeys = new Set();
  const equivalentById = new Map();

  for (const item of orderedRequested) {
    const key = getMenuItemIdentityKey(item);
    if (key) identityKeys.add(key);
    equivalentById.set(String(item._id), item);
  }

  if (identityKeys.size) {
    const siblingQueries = orderedRequested
      .filter((item) => getMenuItemIdentityKey(item))
      .map((item) => buildSiblingIdentityQuery(item));

    // Dedupe identical sibling queries
    const uniqueQueries = [];
    const seen = new Set();
    for (const q of siblingQueries) {
      const sig = `${q.presetType}::${q.title}::${q.creator}::${q.amountQuantity}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      uniqueQueries.push(q);
    }

    if (uniqueQueries.length) {
      const siblings = await MenuItems.find({ $or: uniqueQueries })
        .select(MENU_ITEM_IDENTITY_SELECT)
        .lean();
      for (const sibling of siblings) {
        equivalentById.set(String(sibling._id), sibling);
      }
    }
  }

  const equivalentMenuItems = [...equivalentById.values()];

  const organizerId = companyOrganizer?._id || companyOrganizer;
  const organizationId = organization?._id || organization;
  if (!organizerId || !equivalentMenuItems.length) {
    await attachPresetTypeNames([...orderedRequested, ...equivalentMenuItems]);
    return {
      menuItem: orderedRequested,
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

  await attachPresetTypeNames([
    ...orderedRequested,
    ...equivalentMenuItems,
    ...activeEquivalentMenuItems,
  ]);

  return {
    menuItem: orderedRequested,
    equivalentMenuItems,
    activeEquivalentMenuItems,
    isAvailableOnOrganizerActiveMenus: activeEquivalentMenuItems.length > 0,
  };
};

/**
 * Expand buyMenuItem challenge.taskMenuItem with every menu item that shares
 * presetType + title + creator + amountQuantity (same rule as
 * resolveBuyMenuItemChallengeService). Covers copies on other menus/orgs
 * under the same company organizer (creator).
 */
const attachEquivalentMenuItemsToChallenges = async (challenges = []) => {
  const buyChallenges = challenges.filter(
    (challenge) =>
      challenge?.taskType === "buyMenuItem" &&
      Array.isArray(challenge.taskMenuItem) &&
      challenge.taskMenuItem.length
  );

  if (!buyChallenges.length) return challenges;

  const linkedIds = [
    ...new Set(
      buyChallenges.flatMap((challenge) =>
        challenge.taskMenuItem
          .map((item) => String(getRewardMenuItemId(item)))
          .filter(Boolean)
      )
    ),
  ];

  const linkedItems = await MenuItems.find({ _id: { $in: linkedIds } })
    .select(MENU_ITEM_IDENTITY_SELECT)
    .lean();

  const linkedById = new Map(linkedItems.map((item) => [String(item._id), item]));
  const identityGroups = new Map();

  for (const item of linkedItems) {
    const key = getMenuItemIdentityKey(item);
    if (!key) continue;
    if (!identityGroups.has(key)) identityGroups.set(key, []);
    identityGroups.get(key).push(item);
  }

  const siblingsByKey = new Map();

  if (identityGroups.size) {
    const siblingQueries = [...identityGroups.values()].map((group) =>
      buildSiblingIdentityQuery(group[0])
    );

    const siblings = await MenuItems.find({ $or: siblingQueries }).lean();

    for (const sibling of siblings) {
      const key = getMenuItemIdentityKey(sibling);
      if (!key) continue;
      if (!siblingsByKey.has(key)) siblingsByKey.set(key, []);
      siblingsByKey.get(key).push(sibling);
    }
  }

  return challenges.map((challenge) => {
    if (
      challenge?.taskType !== "buyMenuItem" ||
      !Array.isArray(challenge.taskMenuItem) ||
      !challenge.taskMenuItem.length
    ) {
      return challenge;
    }

    const expandedById = new Map();

    for (const linkedRef of challenge.taskMenuItem) {
      const linkedId = String(getRewardMenuItemId(linkedRef));
      const linkedItem =
        (linkedRef && linkedRef._id ? linkedRef : null) || linkedById.get(linkedId);

      if (!linkedItem) continue;

      const key = getMenuItemIdentityKey(linkedItem);
      const equivalents = key
        ? siblingsByKey.get(key) || [linkedItem]
        : [linkedItem];

      for (const item of equivalents) {
        expandedById.set(String(item._id), item);
      }
    }

    return {
      ...challenge,
      taskMenuItem: [...expandedById.values()],
    };
  });
};

/**
 * Same identity expansion as attachEquivalentMenuItemsToChallenges, but
 * returns only ObjectIds — used by resolveBuyMenuItemChallengeService.
 */
const findEquivalentMenuItemIds = async (menuItemId) => {
  if (!menuItemId) return [];

  const purchasedItem = await MenuItems.findById(menuItemId)
    .select(MENU_ITEM_IDENTITY_SELECT)
    .lean();

  if (!purchasedItem) return [];

  const equivalentMenuItemIds = [purchasedItem._id];
  const key = getMenuItemIdentityKey(purchasedItem);

  if (!key) return equivalentMenuItemIds;

  const equivalentItems = await MenuItems.find({
    _id: { $ne: purchasedItem._id },
    ...buildSiblingIdentityQuery(purchasedItem),
  })
    .select("_id")
    .lean();

  equivalentMenuItemIds.push(...equivalentItems.map((item) => item._id));
  return equivalentMenuItemIds;
};

module.exports = {
  getMenuItemIdentityKey,
  getRewardMenuItemId,
  buildSiblingIdentityQuery,
  resolveBuyMenuItemRewardAvailability,
  attachEquivalentMenuItemsToChallenges,
  findEquivalentMenuItemIds,
  MENU_ITEM_IDENTITY_SELECT,
  asMenuItemArray,
  getMenuItemIds,
};
