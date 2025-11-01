// services/menuItemService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta, convertUtcToTimezone } = require("@utils/responseUtil");
const menuItemRepo = require("./menuItemsRepository");
const mongoose = require("mongoose");
const MenuItems = require("./MenuItems");
const Menus = require("../menu/Menus");
const Venues = require("../../venues/Venues");
const MenuItemCategories = require("../menuItemCategories/MenuItemCategories");
const { formatMenuItems } = require("./fomatter/formatMenuItems");

const createMenuItem = async (data, timezone) => {
  let doc = await menuItemRepo.createMenuItem(data);
  let obj = formatMenuItems(doc, timezone);
  return obj;
};

// Populate menu data for menuItems
const getMenuItems = async ({ page, limit, keyword, status, userId, date, menu, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build early $match for performance
  const match = { creator: new mongoose.Types.ObjectId(userId) };
  if (status) match.status = status; else match.status = { $ne: "deleted" };
  if (menu) match.menu = new mongoose.Types.ObjectId(menu);
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    match.createdAt = { $gte: start, $lt: end };
  }

  const pipeline = [
    { $match: match },

    // Lookup Menus with nested Venue
    {
      $lookup: {
        from: "menus",
        let: { menu: "$menu" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$menu"] } } },
          { $project: { _id: 1, title: 1, image: 1, venue: 1 } },
          {
            $lookup: {
              from: "venues",
              let: { venueId: "$venue" },
              pipeline: [
                { $match: { $expr: { $eq: ["$_id", "$$venueId"] } } },
                { $project: { _id: 1, title: 1, image: 1 } }
              ],
              as: "venue"
            }
          },
          { $unwind: { path: "$venue", preserveNullAndEmptyArrays: true } }
        ],
        as: "menuData"
      }
    },
    { $unwind: { path: "$menuData", preserveNullAndEmptyArrays: true } },

    // Lookup Category
    {
      $lookup: {
        from: "menuitemcategories",
        let: { categoryId: "$category" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$categoryId"] } } },
          { $project: { _id: 1, title: 1, } }
        ],
        as: "categoryData"
      }
    },
    { $unwind: { path: "$categoryData", preserveNullAndEmptyArrays: true } },
  ];

  // Keyword search across item, menu, venue (nested), category
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: MenuItems.schema },                         // item fields
        { schema: Menus.schema, prefix: "menuData." },        // menu fields
        { schema: Venues.schema, prefix: "menuData.venue." }, // venue fields (nested under menu)
        { schema: MenuItemCategories.schema, prefix: "categoryData." } // category fields
      ],
      keyword
    );
    if (Object.keys(keywordMatch).length) pipeline.push({ $match: keywordMatch });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // Pagination + counts
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await MenuItems.aggregate(pipeline);
  const menuItems = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Side counts
  const menuFilter = menu ? { menu: menu } : {};
  const [total, active, inactive] = await Promise.all([
    MenuItems.countDocuments({ creator: userId, status: { $ne: "deleted" }, ...menuFilter }),
    MenuItems.countDocuments({ status: "active", creator: userId, ...menuFilter }),
    MenuItems.countDocuments({ status: "inactive", creator: userId, ...menuFilter })
  ]);

  // Shape final docs
  const formattedMenuItems = menuItems.map(doc => {
    let obj = formatMenuItems(doc, timezone);
  
    return obj;
  });

  const meta = generateMeta(page, limit, totalFiltered);
  meta.menuItemsCount = { total, active, inactive };

  return { menuItems: formattedMenuItems, meta };
};


const updateMenuItem = async (id, data, timezone) => {
  const menuItem = await menuItemRepo.findMenuItemById(id);
  if (!menuItem) return null;

  const allowedFields = [
    "image",
    "title",
    "description",
    "type",
    "category",
    "basePrice",
    "discountPrice",
    "taxPercent",
    "menu",
    "startTime",
    "endTime",
    "status"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return menuItem; // nothing to update
  }

  Object.assign(menuItem, updateData);
  await menuItem.save();

  // Return updated menuItem
  let obj = formatMenuItems(menuItem, timezone);

  return obj;
};

const deleteMenuItem = async (id) => {
  const updated = await menuItemRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getMenuItemDetails = async (id) => {
  const menuItem = await menuItemRepo.findMenuItemById(id);
  if (!menuItem) return null;
  return menuItem;
};



module.exports = {
  createMenuItem,
  getMenuItems,
  updateMenuItem,
  getMenuItemDetails,
  deleteMenuItem,
};
