// repositories/menuItemRepository.js
const MenuItems = require("@MenuItemsModel");
const { MenuItemsCombos } = require("@MenuItemsCombosModel");
const { MenuItemsDiscounts } = require("@MenuItemsDiscountsModel");
const MenuItemsSale = require("@MenuItemsSaleModel");
const { Challenge } = require("../../../commonModules/loyalty/challenges/models/Challenge/index");
const { Promotion } = require("../../../commonModules/loyalty/promotions/models/Promotion/index");
const { Reward } = require("../../../commonModules/loyalty/rewards/models/index");
const { getAllUsers } = require("../../../admin/usersManagement/usersService");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const { default: mongoose } = require("mongoose");
const { generateMeta } = require("@utils/responseUtil");

const NOT_DELETED = { $ne: "deleted" };

const mapRefs = (items = [], titleKey = "title") =>
  items.map((item) => ({
    _id: item._id,
    title: item[titleKey] || item.title || item.name || null,
    status: item.status,
  }));

const findMenuItemDeleteReferences = async (menuItemId) => {
  const objectId = new mongoose.Types.ObjectId(menuItemId);

  const [
    combos,
    discounts,
    sales,
    buyMenuItemChallenges,
    menuItemRewardChallenges,
    buyMenuItemPromotions,
    productSalePromotions,
    buyMenuItemRewards,
  ] = await Promise.all([
    MenuItemsCombos.find({
      status: NOT_DELETED,
      "menuItems.menuItem": objectId,
    })
      .select("name status")
      .lean(),
    MenuItemsDiscounts.find({
      status: NOT_DELETED,
      menuItems: objectId,
    })
      .select("name status type value startDate endDate")
      .lean(),
    MenuItemsSale.find({
      status: NOT_DELETED,
      menuItems: objectId,
    })
      .select("title status discountType discountValue startDateTime endDateTime")
      .lean(),
    Challenge.find({
      status: NOT_DELETED,
      taskType: "buyMenuItem",
      taskMenuItem: objectId,
    })
      .select("title status taskType taskValue")
      .lean(),
    Challenge.find({
      status: NOT_DELETED,
      "reward.rewardType": "menuItem",
      reward: { $exists: true },
      "reward.rewardMenuItem": objectId,
    })
      .select("title status taskType reward.rewardType")
      .lean(),
    Promotion.find({
      status: NOT_DELETED,
      promotionType: "buyMenuItemPromotion",
      menuItem: objectId,
    })
      .select("title status promotionType startDate endDate")
      .lean(),
    Promotion.find({
      status: NOT_DELETED,
      promotionType: "productSale",
      menuItem: objectId,
    })
      .select("title status promotionType startDate endDate")
      .lean(),
    Reward.find({
      status: NOT_DELETED,
      rewardType: "buyMenuItemReward",
      menuItem: objectId,
    })
      .select("title status rewardType endDate")
      .lean(),
  ]);

  const references = {
    combos: mapRefs(combos, "name"),
    discounts: mapRefs(discounts, "name"),
    sales: mapRefs(sales, "title"),
    challenges: {
      buyMenuItemTask: mapRefs(buyMenuItemChallenges),
      menuItemReward: mapRefs(menuItemRewardChallenges),
    },
    promotions: {
      buyMenuItemPromotion: mapRefs(buyMenuItemPromotions),
      productSale: mapRefs(productSalePromotions),
    },
    rewards: {
      buyMenuItemReward: mapRefs(buyMenuItemRewards),
    },
  };

  const counts = {
    combos: references.combos.length,
    discounts: references.discounts.length,
    sales: references.sales.length,
    challengesBuyMenuItemTask: references.challenges.buyMenuItemTask.length,
    challengesMenuItemReward: references.challenges.menuItemReward.length,
    promotionsBuyMenuItem: references.promotions.buyMenuItemPromotion.length,
    promotionsProductSale: references.promotions.productSale.length,
    rewardsBuyMenuItem: references.rewards.buyMenuItemReward.length,
  };

  const totalReferences = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return {
    references,
    counts,
    totalReferences,
    hasReferences: totalReferences > 0,
  };
};

const cascadeSoftDeleteMenuItemReferences = async (menuItemId, session = null) => {
  const objectId = new mongoose.Types.ObjectId(menuItemId);
  const options = session ? { session } : {};

  const [
    combos,
    discounts,
    sales,
    challengesBuyMenuItemTask,
    challengesMenuItemReward,
    promotionsBuyMenuItem,
    promotionsProductSale,
    rewardsBuyMenuItem,
  ] = await Promise.all([
    MenuItemsCombos.updateMany(
      { status: NOT_DELETED, "menuItems.menuItem": objectId },
      { $set: { status: "deleted" } },
      options,
    ),
    MenuItemsDiscounts.updateMany(
      { status: NOT_DELETED, menuItems: objectId },
      { $set: { status: "deleted" } },
      options,
    ),
    MenuItemsSale.updateMany(
      { status: NOT_DELETED, menuItems: objectId },
      { $set: { status: "deleted" } },
      options,
    ),
    Challenge.updateMany(
      {
        status: NOT_DELETED,
        taskType: "buyMenuItem",
        taskMenuItem: objectId,
      },
      { $set: { status: "deleted" } },
      options,
    ),
    Challenge.updateMany(
      {
        status: NOT_DELETED,
        "reward.rewardType": "menuItem",
        reward: { $exists: true },
        "reward.rewardMenuItem": objectId,
      },
      { $set: { status: "deleted" } },
      options,
    ),
    Promotion.updateMany(
      {
        status: NOT_DELETED,
        promotionType: "buyMenuItemPromotion",
        menuItem: objectId,
      },
      { $set: { status: "deleted" } },
      options,
    ),
    Promotion.updateMany(
      {
        status: NOT_DELETED,
        promotionType: "productSale",
        menuItem: objectId,
      },
      { $set: { status: "deleted" } },
      options,
    ),
    Reward.updateMany(
      {
        status: NOT_DELETED,
        rewardType: "buyMenuItemReward",
        menuItem: objectId,
      },
      { $set: { status: "deleted" } },
      options,
    ),
  ]);

  const cascaded = {
    combos: combos.modifiedCount,
    discounts: discounts.modifiedCount,
    sales: sales.modifiedCount,
    challengesBuyMenuItemTask: challengesBuyMenuItemTask.modifiedCount,
    challengesMenuItemReward: challengesMenuItemReward.modifiedCount,
    promotionsBuyMenuItem: promotionsBuyMenuItem.modifiedCount,
    promotionsProductSale: promotionsProductSale.modifiedCount,
    rewardsBuyMenuItem: rewardsBuyMenuItem.modifiedCount,
  };

  const totalCascaded = Object.values(cascaded).reduce((sum, n) => sum + n, 0);

  return { cascaded, totalCascaded };
};

// Create menuItem in a transaction and update organization

const createMenuItem = async (data) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { menuIds, ...menuItemData } = data;

    const docs = menuIds.map((menuId) => ({
      ...menuItemData,
      menu: menuId,
    }));

    const createdMenuItems = await MenuItems.insertMany(docs, {
      session,
    });

    await session.commitTransaction();

    return createdMenuItems;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Get all menuItems with their assigned organization populated, sorted by createdAt descending
const getMenuItemsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  const menuItems = await MenuItems.find(query)
    .populate({
      path: "menu",
      select: "title description",
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  if (!menuItems || menuItems.length === 0) {
    return menuItems;
  }
  return menuItems;
};
// Count by condition
const countMenuItems = async (query = {}) => {
  return MenuItems.countDocuments(query);
};

// Find by ID
const findMenuItemById = async (id) => {
  return MenuItems.findById(id)
    .populate({
      path: "daypart",
      select: "name code status startTime endTime isAllDay",
    })
    .populate({
      path: "allergens",
      select: "name code status",
    });
};

// Update and save
const updateMenuItemData = async (menuItem, data) => {
  Object.assign(menuItem, data);

  return await menuItem.save();
};

// Delete
const deleteMenuItemById = async (menuItem) => {
  return await menuItem.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data, session = null) => {
  return MenuItems.findByIdAndUpdate(id, data, {
    new: true,
    ...(session ? { session } : {}),
  });
};

//get menuItems for menuItem options dropdown where organization is not assigned yet

const getUnassignedMenuItems = async (userId) => {
  return await MenuItems.find({
    status: "active",
    organization: { $in: [null, undefined] },
    creator: userId,
  });
};

const findMenuItemsByMenuId = async (menuId) => {
  return MenuItems.find({
    menu: menuId,
    status: "active",
  });
};

const getMenuItemsBySubCategory = async (subCategoryId, options = {}) => {
  const { status, page = 1, limit = 10 } = options;

  const filter = { subCategory: subCategoryId };
  if (status) filter.status = status;

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    MenuItems.find(filter)
      .select("_id title status")
      // caseFirst: "lower" makes "a" sort before "A" (default Mongo/ICU puts "A" first)
      .collation({
        locale: "en",
        strength: 2,
        caseLevel: true,
        caseFirst: "lower",
      })
      .sort({ title: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    MenuItems.countDocuments(filter),
  ]);
  const meta = generateMeta(page, limit, total);

  return {
    data,
    meta,
  };
};

module.exports = {
  createMenuItem,
  getMenuItemsWithFilters,
  countMenuItems,
  getUnassignedMenuItems,
  findMenuItemById,
  updateMenuItemData,
  deleteMenuItemById,
  findByIdAndUpdate,
  findMenuItemsByMenuId,
  getMenuItemsBySubCategory,
  findMenuItemDeleteReferences,
  cascadeSoftDeleteMenuItemReferences,
};
