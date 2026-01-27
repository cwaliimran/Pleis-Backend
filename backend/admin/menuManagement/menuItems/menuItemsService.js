// services/menuItemService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta, convertUtcToTimezone } = require("@utils/responseUtil");
const menuItemRepo = require("./menuItemsRepository");
const mongoose = require("mongoose");
const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");
const Venues = require("@VenuesModel");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const { getMenuIdsByCompanyOrganizer } = require("../../organizations/organizationRepository");
const { formatMenuItem, formatBundleMenuItem } = require("../menuItemCategories/formatter/formatItemCategories");
const Organizations = require("@OrganizationModel");


const createMenuItem = async (data, timezone) => {
  let doc = await menuItemRepo.createMenuItem(data);
  let obj = formatMenuItem(doc, timezone);
  return obj;
};

// Populate menu data for menuItems
const getMenuItems = async ({
  page = 1,
  limit = 10,
  keyword,
  status,
  date,
  menu,
  timezone,
  companyOrganizer
}) => {
    const skip = limit === 0 ? 0 : (page - 1) * limit;
  let menuIds = [];

  if (companyOrganizer) {
    menuIds = await getMenuIdsByCompanyOrganizer(companyOrganizer);

    if (!menuIds.length) {
      return {
        menuItems: [],
        meta: generateMeta(page, limit, 0)
      };
    }
  }



  // ✅ BASE MATCH (NO menu here)
  const baseMatch = {
    ...(status ? { status } : { status: { $ne: "deleted" } })
  };

  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    baseMatch.createdAt = { $gte: start, $lt: end };
  }

  if (keyword) {
    baseMatch.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } }
    ];
  }

  const pipeline = [
    { $match: baseMatch },

    // 🔹 SAME AS getSummary
    {
      $lookup: {
        from: "menus",
        localField: "menu",
        foreignField: "_id",
        pipeline: [
          { $project: { _id: 1, title: 1, organization: 1 } }
        ],
        as: "menu"
      }
    },
    { $unwind: "$menu" },
        {
      $lookup: {
        from: "menuitemcategories",
        localField: "category",
        foreignField: "_id",
        pipeline: [
          { $project: { _id: 1, title: 1, image: 1 } }
        ],
        as: "category"
      }
    },
     { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },

    
    // ✅ FILTER AFTER LOOKUP
    ...(menu
      ? [{ $match: { "menu._id": new mongoose.Types.ObjectId(menu) } }]
      : []),

    ...(menuIds.length
      ? [{
        $match: {
          "menu._id": {
            $in: menuIds.map(id => new mongoose.Types.ObjectId(id))
          }
        }
      }]
      : []),

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        data: [
          { $skip: skip },
          ...(limit === 0 ? [] : [{ $limit: limit }])
        ],
        total: [{ $count: "count" }]
      }
    }
  ];

  const result = await MenuItems.aggregate(pipeline);
  const data = result[0]?.data || [];
  const total = result[0]?.total?.[0]?.count || 0;

  return {
    menuItems: data.map(item => formatMenuItem(item, timezone)),
    meta: generateMeta(page, limit, total)
      };
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
    "status",
    "isLimitedTimeOffer",
    "isScheduled",
    "startDate",
    "endDate",
    "isAvailableInStock",
    "upSellItem",
    "availabilityType",
    "event",
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
  let obj = formatMenuItem(menuItem, timezone);

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


const getMenuItemsByMenuId = async (menuId, timezone) => {
  const menuItems = await menuItemRepo.findMenuItemsByMenuId(menuId);
  const formattedItems = menuItems.map(item => formatMenuItem(item, timezone));
  return formattedItems;
};

const getBundleMenuItems = async ({ page, limit, keyword, status, date, menu, timezone, companyOrganizer }) => {
  let menuIds = [];

  // 1️⃣ Get menus created by companyOrganizer
  if (companyOrganizer) {
    menuIds = await getMenuIdsByCompanyOrganizer(companyOrganizer);
    if (menuIds.length === 0) {
      return {
        menuItems: [],
        meta: generateMeta(page, limit, 0, { total: 0, active: 0, inactive: 0 })
      };
    }
  }

  // 2️⃣ Pagination setup
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // 3️⃣ Build aggregation pipeline
  const pipeline = [];

  // Filter by menus (from companyOrganizer)
  if (menuIds.length > 0) {
    pipeline.push({
      $match: { menu: { $in: menuIds.map(id => new mongoose.Types.ObjectId(id)) } }
    });
  }

  // Filter by specific menu (if provided)
  if (menu) {
    pipeline.push({
      $match: { menu: new mongoose.Types.ObjectId(menu) }
    });
  }

  // Status filter
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  // Date filter
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({ $match: { createdAt: { $gte: start, $lt: end } } });
  }

  // 4️⃣ Populate Menu (with Venue + Organization)
  pipeline.push(
    {
      $lookup: {
        from: "menus",
        let: { menu: "$menu" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$menu"] } } },
          { $project: { _id: 1, title: 1, image: 1, venue: 1, organization: 1 } },
          // 🔹 Lookup Organization (like in getMenus)
          {
            $lookup: {
              from: "organizations",
              localField: "organization",
              foreignField: "_id",
              as: "organizationData",
              pipeline: [
                { $project: { _id: 1, "basicInfo.name": 1 } }
              ]
            }
          },
          { $unwind: { path: "$organizationData", preserveNullAndEmptyArrays: true } },
          // 🔹 Lookup Venue
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
          { $unwind: { path: "$venue", preserveNullAndEmptyArrays: true } },
          // Merge organizationData → organization
          { $addFields: { organization: "$organizationData" } },
          { $project: { organizationData: 0 } }
        ],
        as: "menuData"
      }
    },
    { $unwind: { path: "$menuData", preserveNullAndEmptyArrays: true } }
  );

  // 5️⃣ Populate Category
  pipeline.push(
    {
      $lookup: {
        from: "menuitemcategories",
        let: { categoryId: "$category" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$categoryId"] } } },
          { $project: { _id: 1, title: 1 } }
        ],
        as: "categoryData"
      }
    },
    { $unwind: { path: "$categoryData", preserveNullAndEmptyArrays: true } }
  );

  // 6️⃣ Keyword search (Menu, Venue, Organization, Category)
  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [
        { schema: MenuItems.schema },
        { schema: Menus.schema, prefix: "menuData." },
        { schema: Venues.schema, prefix: "menuData.venue." },
        { schema: Organizations.schema, prefix: "menuData.organization." },
        { schema: MenuItemCategories.schema, prefix: "categoryData." }
      ],
      keyword
    );

    if (Object.keys(keywordMatch).length > 0) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  // 7️⃣ Sort + Pagination
  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  // 8️⃣ Execute pipeline
  const result = await MenuItems.aggregate(pipeline);
  const menuItems = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // 9️⃣ Count stats for meta
  const baseFilter =
    menuIds.length > 0
      ? { menu: { $in: menuIds.map(id => new mongoose.Types.ObjectId(id)) } }
      : {};

  const [total, active, inactive] = await Promise.all([
    MenuItems.countDocuments({ ...baseFilter, status: { $ne: "deleted" } }),
    MenuItems.countDocuments({ ...baseFilter, status: "active" }),
    MenuItems.countDocuments({ ...baseFilter, status: "inactive" })
  ]);

  // 🔟 Format + Meta
  const formattedMenuItems = menuItems.map(doc => formatBundleMenuItem(doc, timezone));

  const meta = generateMeta(page, limit, totalFiltered);
  meta.menuItemsCount = { total, active, inactive };

  return {
    menuItems: formattedMenuItems,
    meta
  };
};
module.exports = {
  createMenuItem,
  getMenuItems,
  updateMenuItem,
  getMenuItemDetails,
  deleteMenuItem,
  getMenuItemsByMenuId,
  getBundleMenuItems
};
