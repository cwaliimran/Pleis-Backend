
const { getRewardById } = require("../../../app/loyalty/rewards/rewardsRepository");
const {
  Promotion,
  BuyMenuItemPromotion,
  HappyHourPromotion,
  ProductSalePromotion,
  ClaimPromotion,
  extraPointsForItemPromotion,
} = require("../../../commonModules/loyalty/promotions/models/Promotion/");

// Decide which discriminator model to use
const getModelBypromotionType = (promotionType) => {
  switch (promotionType) {
    case "buyMenuItemPromotion":
      return BuyMenuItemPromotion;
    case "happyHour":
      return HappyHourPromotion;
    case "productSale":
      return ProductSalePromotion;
    case "claimPromotion":
      return ClaimPromotion;
    case "extraPointsForItem":
      return extraPointsForItemPromotion;
    default:
      return Promotion; // fallback
  }
};

// Create promotion
const create = async (data) => {
  try {
    const Model = getModelBypromotionType(data.promotionType);
    const reward = await getRewardById(data.reward);
    if (data.promotionType === "claimPromotion") {
      if (data.claimLimit > reward.claimLimit) {
        throw new Error("Promotion claim limit cannot exceed reward claim limit");
      }
    }
    const item = new Model(data);
    const saved = await item.save();
    return saved.toObject(); // Removes Mongoose internals
  } catch (err) {
    throw err;
  }
};


// const getWithFilters = async (query, skip = 0, limit = 20) => {

//   // Build aggregation pipeline
//   const pipeline = [
//     { $match: query },
//     { $sort: { createdAt: -1 } },
//     { $skip: skip },
//   ];

//   if (limit > 0) pipeline.push({ $limit: limit });

//   // --- Lookup reward (for claimPromotion) ---
//   pipeline.push({
//     $lookup: {
//       from: "rewards",
//       localField: "reward",
//       foreignField: "_id",
//       as: "reward",
//     },
//   });

//   // --- Lookup menuItem (for buyMenuItemPromotion and productSale) ---
//   pipeline.push({
//     $lookup: {
//       from: "menuitems",
//       localField: "menuItem",
//       foreignField: "_id",
//       as: "menuItem",
//     },
//   });

//   // --- Lookup tierLimit (populate tier title and image) ---
//   pipeline.push({
//     $lookup: {
//       from: "tiers",
//       localField: "tierLimit",
//       foreignField: "_id",
//       as: "tierLimit",
//       pipeline: [
//         { $project: { _id: 1, title: 1, } }
//       ]
//     }
//   });

//   // --- Conditionally include the correct populated field based on promotionType ---
//   pipeline.push({
//     $addFields: {
//       reward: {
//         $cond: [
//           { $eq: ["$promotionType", "claimPromotion"] },
//           { $arrayElemAt: ["$reward", 0] },
//           null,
//         ],
//       },
//       menuItem: {
//         $cond: [
//           { $in: ["$promotionType", ["buyMenuItemPromotion", "productSale"]] },
//           { $arrayElemAt: ["$menuItem", 0] },
//           null,
//         ],
//       },
//       tierLimit: {
//         $cond: [
//           { $ne: ["$tierLimit", []] },
//           { $arrayElemAt: ["$tierLimit", 0] },
//           null,
//         ],
//       },
//     },
//   });

//   const results = await Promotion.aggregate(pipeline).allowDiskUse(true);
//   return results;
// };
const getWithFilters = async (
  query,
  skip = 0,
  limit = 20,
  sortBy = "createdAt",
  sortOrder = "desc"
) => {
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  let sortStage = { createdAt: -1, _id: -1 };

  if (sortBy === "title") {
    sortStage = { titleSort: sortDirection, _id: -1 };
  } else if (sortBy === "description") {
    sortStage = { descriptionSort: sortDirection, _id: -1 };
  } else if (sortBy === "promotionType") {
    sortStage = { promotionTypeSort: sortDirection, _id: -1 };
  } else if (sortBy === "createdAt") {
    sortStage = { createdAt: sortDirection, _id: sortDirection };
  }

  const pipeline = [
    { $match: query },

    {
      $addFields: {
        titleSort: { $toLower: { $ifNull: ["$title", ""] } },
        descriptionSort: { $toLower: { $ifNull: ["$description", ""] } },
        promotionTypeSort: { $toLower: { $ifNull: ["$promotionType", ""] } },
      },
    },

    { $sort: sortStage },
    { $skip: skip },
  ];

  if (limit > 0) pipeline.push({ $limit: limit });

  pipeline.push(
    {
      $lookup: {
        from: "rewards",
        localField: "reward",
        foreignField: "_id",
        as: "reward",
      },
    },
    {
      $lookup: {
        from: "menuitems",
        localField: "menuItem",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
        as: "menuItem",
      },
    },
    {
      $lookup: {
        from: "tiers",
        localField: "tierLimit",
        foreignField: "_id",
        as: "tierLimit",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
      },
    },
    {
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
            {
              $in: [
                "$promotionType",
                ["buyMenuItemPromotion", "productSale", "extraPointsForItem"],
              ],
            },
            "$menuItem",
            [],
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
    },
    {
      $project: {
        titleSort: 0,
        descriptionSort: 0,
        promotionTypeSort: 0,
      },
    },
  );

  return Promotion.aggregate(pipeline).allowDiskUse(true);
};

module.exports = {
  getWithFilters,
};


// Count
const count = async (query = {}) => {
  return Promotion.countDocuments(query);
};

// Find by ID with population
const findById = async (id) => {
  return Promotion.findById(id)
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

  return Promotion.findByIdAndUpdate(id, data, { new: true })
    .populate("menuItem")
    .populate("tierLimit");
};
const getPromotionsByCreator = async (creatorId) => {
  try {
    // Query the promotions table based on the creator ID
    const promotions = await Promotion.find({ companyOrganizer: creatorId });

    // Return promotions details or an empty array if none are found
    return promotions.length > 0 ? promotions : [];
  } catch (error) {

    return [];
  }
};

module.exports = {
  create,
  getWithFilters,
  count,
  findById,
  updateData,
  deleteItem,
  findByIdAndUpdate,
  getPromotionsByCreator
};
