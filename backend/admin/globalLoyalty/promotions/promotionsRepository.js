const {
  GlobalBasePromotion,
  GlobalHappyHourPromotion,
  GlobalClaimPromotion,
} = require("../../../commonModules/globalLoyalty/promotions/models/Promotion");


// Decide which discriminator model to use
const getModelByTaskType = (taskType) => {
  switch (taskType) {
    case "globalHappyHourPromotion":
      return GlobalHappyHourPromotion;
    case "globalClaimPromotion":
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
  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
  ];

  if (limit > 0) pipeline.push({ $limit: limit });

  // Reward lookup for globalClaimPromotion
  pipeline.push({
    $lookup: {
      from: "globalrewards",
      localField: "reward",
      foreignField: "_id",
      as: "reward"
    }
  });

  // Menu item
  pipeline.push({
    $lookup: {
      from: "menuitems",
      localField: "menuItem",
      foreignField: "_id",
      as: "menuItem"
    }
  });

  // Tier limit
  pipeline.push({
    $lookup: {
      from: "globalstatuslevels",
      localField: "tierLimit",
      foreignField: "_id",
      as: "tierLimit"
    }
  });

  // Flatten arrays (always return full data)
  pipeline.push({
    $addFields: {
      reward: { $arrayElemAt: ["$reward", 0] },
      menuItem: { $arrayElemAt: ["$menuItem", 0] },
      tierLimit: { $arrayElemAt: ["$tierLimit", 0] },
    }
  });

  return await GlobalBasePromotion.aggregate(pipeline).allowDiskUse(true);
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
