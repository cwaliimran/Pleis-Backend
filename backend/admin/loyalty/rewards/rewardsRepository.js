const { generateMeta } = require("@utils/responseUtil");
const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");
const formatReward = require("./utils/formatReward");
const mongoose = require("mongoose");

// Decide which discriminator model to use
const getModelByrewardType = (rewardType) => {
  switch (rewardType) {
    case "buyMenuItemReward":
      return BuyMenuItemReward;
    case "ticketReward":
      return TicketReward;
    case "customReward":
      return CustomReward;
    default:
      return BuyMenuItemReward; // fallback
  }
};

// Create reward
const create = async (data) => {
  try {
    const Model = getModelByrewardType(data.rewardType);
    const item = new Model(data);
    await item.save();
    // Clean up the Mongoose properties before returning
    const formattedItem = formatReward(item.toObject(), null); // Pass the clean object here
    return formattedItem;
  } catch (err) {
    throw err;
  }
};

// Get reward with population
const getWithFilters = async (
  query = {},
  skip = 0,
  limit = 10,
  sortBy = "createdAt",
  sortOrder = "desc",
) => {
  return Reward.aggregate([
    { $match: query },

    {
      $lookup: {
        from: "menuitems",
        localField: "menuItem",
        foreignField: "_id",
        as: "menuItem",
        pipeline: [
          { $project: { title: 1, menu: 1 } },
          {
            $lookup: {
              from: "menus",
              localField: "menu",
              foreignField: "_id",
              as: "menu",
              pipeline: [{ $project: { title: 1 } }],
            },
          },
          { $unwind: { path: "$menu", preserveNullAndEmptyArrays: true } },
        ],
      },
    },
    { $unwind: { path: "$menuItem", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "tiers", // adjust to actual tierLimit collection name
        localField: "tierLimit",
        foreignField: "_id",
        as: "tierLimit",
        pipeline: [{ $project: { title: 1 } }],
      },
    },
    { $unwind: { path: "$tierLimit", preserveNullAndEmptyArrays: true } },

    {
      $lookup: {
        from: "engagementevents",
        let: { rewardId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$entityType", "rewards"] },
                  { $eq: ["$entityId", "$$rewardId"] },
                ],
              },
            },
          },
          { $group: { _id: "$action", count: { $sum: 1 } } },
        ],
        as: "engagementCounts",
      },
    },

    {
      $lookup: {
        from: "favorites",
        let: { rewardId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$targetType", "reward"] },
                  { $eq: ["$targetId", "$$rewardId"] },
                ],
              },
            },
          },
          { $count: "count" },
        ],
        as: "favoritesCount",
      },
    },

    {
      $lookup: {
        from: "loyaltyrewardsorders",
        let: { rewardId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$sourceType", "rewards"] },
                  { $eq: ["$sourceId", "$$rewardId"] },
                ],
              },
            },
          },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ],
        as: "ordersByStatus",
      },
    },

    {
      $addFields: {
        favoritesCount: {
          $ifNull: [{ $arrayElemAt: ["$favoritesCount.count", 0] }, 0],
        },
        engagementObj: {
          $arrayToObject: {
            $map: {
              input: "$engagementCounts",
              as: "e",
              in: { k: "$$e._id", v: "$$e.count" },
            },
          },
        },
        ordersObj: {
          $arrayToObject: {
            $map: {
              input: "$ordersByStatus",
              as: "o",
              in: { k: "$$o._id", v: "$$o.count" },
            },
          },
        },
      },
    },
    {
      $addFields: {
        views: { $ifNull: ["$engagementObj.view", 0] },
        redeemed: { $ifNull: ["$ordersObj.pending", 0] },
        claimed: { $ifNull: ["$ordersObj.completed", 0] },
      },
    },
    {
      $addFields: {
        conversion: {
          $cond: [
            { $gt: ["$claimed", 0] },
            {
              $round: [
                { $multiply: [{ $divide: ["$redeemed", "$claimed"] }, 100] },
                2,
              ],
            },
            0,
          ],
        },
      },
    },

    {
      $project: {
        engagementCounts: 0,
        ordersByStatus: 0,
        engagementObj: 0,
        ordersObj: 0,
      },
    },
    { $sort: { [sortBy]: sortOrder === "asc" ? 1 : -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);
};

// Count
const count = async (query = {}) => {
  return Reward.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return Reward.findById(id)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" })
    .exec();
};

// Update and save
const updateData = async (item, data) => {
  Object.assign(item, data);
  return await item.save();
};

// Delete
const deleteItem = async (item) => {
  return await item.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Reward.findByIdAndUpdate(id, data, { new: true })
    .populate("menuItem")
    .populate("tierLimit");
};

const getRewards = async ({ page, limit, companyOrganizer }) => {
  const skip = (page - 1) * limit;
  try {
    const rewards = await Reward.find({
      companyOrganizer,
      status: "active", // Filter by 'active' status
    })
      .skip(skip)
      .limit(limit)
      .select("_id title"); // Only select _id and title
    return rewards;
  } catch (error) {
    console.error(error);
    throw error;
  }
};
const getAllTypes = async ({ companyOrganizer, page, limit }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };
  const records = await Reward.aggregate([
    { $match: query },
    {
      $project: {
        sortingType: 1,
        _id: 1,
      },
    },
    { $skip: skip },
    { $limit: limit },
  ]);
  const totalFiltered = await Reward.countDocuments(query);
  const meta = generateMeta(page, limit, totalFiltered);
  return { types: records, meta };
};

module.exports = {
  create,
  getWithFilters,
  count,
  findById,
  updateData,
  deleteItem,
  findByIdAndUpdate,
  getRewards,
  getAllTypes,
};
