const {
  GlobalBasePromotion,
  GlobalBuyMenuItemPromotion,
  GlobalHappyHourPromotion,
  GlobalProductSalePromotion,
  GlobalClaimPromotion,
} = require("../../../commonModules/globalLoyalty/promotions/models/Promotion");


// Decide which discriminator model to use
const getModelByTaskType = (taskType) => {
  switch (taskType) {

    case "buyMenuItemPromotion":
      return GlobalBuyMenuItemPromotion;
    case "happyHour":
      return GlobalHappyHourPromotion;
    case "productSale":
      return GlobalProductSalePromotion;
    case "claimPromotion":
      return GlobalClaimPromotion;
    default:
      return GlobalBasePromotion; // fallback
  }
};

// Create promotion
const create = async (data) => {
  try {
    const Model = getModelByTaskType(data.taskType);
    const item = new Model(data);
    const saved = await item.save();
    return saved.toObject(); // Removes Mongoose internals
  } catch (err) {
    throw err;
  }
};


const getWithFilters = async (query, skip = 0, limit = 20) => {
  // Build aggregation pipeline
  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
  ];

  if (limit > 0) pipeline.push({ $limit: limit });

  // --- Lookup reward (for claimPromotion) ---
  pipeline.push({
    $lookup: {
      from: "rewards",
      localField: "reward",
      foreignField: "_id",
      as: "reward",
    },
  });

  // --- Lookup menuItem (for buyMenuItemPromotion and productSale) ---
  pipeline.push({
    $lookup: {
      from: "menuitems",
      localField: "menuItem",
      foreignField: "_id",
      as: "menuItem",
    },
  });

  // --- Lookup tierLimit (populate tier title and image) ---
  pipeline.push({
    $lookup: {
      from: "tiers",
      localField: "tierLimit",
      foreignField: "_id",
      as: "tierLimit",
      pipeline: [
        { $project: { _id: 1, title: 1, } }
      ]
    }
  });

  // --- Conditionally include the correct populated field based on promotionType ---
  pipeline.push({
    $addFields: {
      reward: {
        $cond: [
          { $eq: ["$promotionType", "claimPromotion"] },
          { $arrayElemAt: ["$reward", 0] },
          null,
        ],
      },
      menuItem: {
        $cond: [
          { $in: ["$promotionType", ["buyMenuItemPromotion", "productSale"]] },
          { $arrayElemAt: ["$menuItem", 0] },
          null,
        ],
      },
      tierLimit: {
        $cond: [
          { $ne: ["$tierLimit", []] },
          { $arrayElemAt: ["$tierLimit", 0] },
          null,
        ],
      },
    },
  });

  const results = await GlobalBasePromotion.aggregate(pipeline).allowDiskUse(true);
  return results;
};

module.exports = {
  getWithFilters,
};


// Count
const count = async (query = {}) => {
  return GlobalBasePromotion.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return GlobalBasePromotion.findById(id)
    .populate("menuItem")
    .populate({ path: "tierLimit", select: "image title" }).exec();
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
  return GlobalBasePromotion.findByIdAndUpdate(id, data, { new: true })
    .populate("menuItem")
    .populate("tierLimit");
};

module.exports = {
  create,
  getWithFilters,
  count,
  findById,
  updateData,
  deleteItem,
  findByIdAndUpdate,
};
