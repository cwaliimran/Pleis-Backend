// services/menuItemService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta, convertUtcToTimezone } = require("@utils/responseUtil");
const menuItemRepo = require("./menuItemsRepository");
const mongoose = require("mongoose");
const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");
const Venues = require("@VenuesModel");
const MenuItemCategories = require("@MenuItemCategoriesModel");
const { getMenuIdsByCompanyOrganizer, getMenuIdsByOrganization } = require("../../organizations/organizationRepository");
const { formatMenuItem, formatBundleMenuItem } = require("../menuItemCategories/formatter/formatItemCategories");
const Organizations = require("@OrganizationModel");
const Presets = require("@PresetsModel");
const { addMenuIdPipeline } = require("../../../shared/menuItems/menuField");


const createMenuItem = async (data, timezone) => {
  const doc = await menuItemRepo.createMenuItem(data);
  const populated = await menuItemRepo.findMenuItemById(doc._id);
  return formatMenuItem(populated || doc, timezone);
};



const importMenuItems = async (data) => {
  const {
    menu,
    companyOrganizer,
    presetItems = [],
    subCategory,
  } = data;

  // remove invalid / duplicate ids from request
  const uniquePresetIds = [
    ...new Set(
      presetItems.map((id) => id.toString())
    ),
  ];

  if (!uniquePresetIds.length) {
    return [];
  }


  const alreadyImportedItems = await MenuItems.find({
    creator: companyOrganizer,
    parentPreset: {
      $in: uniquePresetIds,
    },
    status: {
      $ne: "deleted",
    },
  }).select("parentPreset menu");

  const alreadyImportedPresetIds = new Set(
    alreadyImportedItems.map((item) =>
      item.parentPreset.toString()
    )
  );

  const menuObjectId = new mongoose.Types.ObjectId(menu);

  for (const item of alreadyImportedItems) {
    await MenuItems.updateOne(
      { _id: item._id },
      addMenuIdPipeline(menuObjectId),
    );
  }

  const filteredPresetIds = uniquePresetIds.filter(
    (id) => !alreadyImportedPresetIds.has(id)
  );

  if (!filteredPresetIds.length) {
    return alreadyImportedItems;
  }

  // fetch presets
  const presets = await Presets.find({
    _id: {
      $in: filteredPresetIds.map((id) => new mongoose.Types.ObjectId(id)),
    },
  });

  if (!presets.length) {
    return alreadyImportedItems;
  }

  // map preset -> menu item shape
  const menuItemsData = presets.map((preset) => ({
    image: preset.image || "",
    title: preset.title || "",
    description: preset.description || "",
    category: preset.category,
    subCategory: preset.subCategory || subCategory,
    basePrice: Number(preset.basePrice || 0),

    menu: [menuObjectId],
    creator: companyOrganizer,

    // optional defaults
    type: "Default",
    taxPercent: 0,

    startTime: null,
    endTime: null,

    isLimitedTimeOffer: false,
    isScheduled: false,

    startDate: null,
    endDate: null,

    event: null,
    availabilityType: null,

    upSellItem: false,
    isAvailableInStock: true,

    status: "active",

    // tracking imported preset
    parentPreset: preset._id,
  }));



  try {
    const insertedItems = await MenuItems.insertMany(
      menuItemsData,
      {
        ordered: true, // stop on first error
      }
    );

    return insertedItems;

  } catch (error) {
    console.log(
      "IMPORT ERROR",
      JSON.stringify(error, null, 2)
    );

    throw error;
  }


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
  companyOrganizer,
  organizations,
  sortBy,
  sortOrder,
  subCategory,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let menuIds = [];
  if (organizations) {
    menuIds = await getMenuIdsByOrganization(organizations);

    if (!menuIds.length) {
      return {
        menuItems: [],
        meta: generateMeta(page, limit, 0),
      };
    }
  } else if (companyOrganizer) {
    menuIds = await getMenuIdsByCompanyOrganizer(companyOrganizer);

    if (!menuIds.length) {
      return {
        menuItems: [],
        meta: generateMeta(page, limit, 0),
      };
    }
  }

  const baseMatch = {
    ...(status ? { status } : { status: { $ne: "deleted" } }),
  };

  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);
    baseMatch.createdAt = { $gte: start, $lt: end };
  }
  if (subCategory) {
    baseMatch.subCategory = new mongoose.Types.ObjectId(subCategory);
  }

  if (keyword) {
    baseMatch.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
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
        pipeline: [{ $project: { _id: 1, title: 1, organization: 1 } }],
        as: "menu",
      },
    },
    {
      $lookup: {
        from: "menusubcategories",
        localField: "subCategory",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, title: 1 } }],
        as: "subCategory",
      },
    },
    { $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "dayparts",
        localField: "daypart",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              name: 1,
              code: 1,
              status: 1,
              startTime: 1,
              endTime: 1,
              isAllDay: 1,
            },
          },
        ],
        as: "daypart",
      },
    },
    // daypart is an array of refs — do not $unwind (causes row duplication)
    {
      $lookup: {
        from: "allergens",
        localField: "allergens",
        foreignField: "_id",
        as: "allergens",
        pipeline: [{ $project: { _id: 1, name: 1, code: 1, status: 1 } }],
      },
    },
    //also populate serving size
    {
      $lookup: {
        from: "servings",
        localField: "servingSize",
        foreignField: "_id",
        pipeline: [{ $project: { _id: 1, type: 1, code: 1, unit: 1 } }],
        as: "serving",
      },
    },
    { $unwind: { path: "$serving", preserveNullAndEmptyArrays: true } },
    // diet tags — keep as array; do not $unwind (causes row duplication)
    {
      $lookup: {
        from: "diettags",
        localField: "dietTags",
        foreignField: "_id",
        as: "dietTags",
        pipeline: [{ $project: { _id: 1, name: 1, code: 1, status: 1 } }],
      },
    },

    // ✅ FILTER AFTER LOOKUP
    ...(menu
      ? [{ $match: { "menu._id": new mongoose.Types.ObjectId(menu) } }]
      : []),

    ...(menuIds.length
      ? [
          {
            $match: {
              "menu._id": {
                $in: menuIds.map((id) => new mongoose.Types.ObjectId(id)),
              },
            },
          },
        ]
      : []),
  ];
  if (sortBy && sortOrder) {
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    if (["menuItemName", "description", "menuName"].includes(sortBy)) {
      const sortFieldMap = {
        menuItemName: "$title",
        description: "$description",
        menuName: { $arrayElemAt: ["$menu.title", 0] },
      };

      pipeline.push({
        $addFields: {
          sortValue: {
            $toLower: {
              $ifNull: [sortFieldMap[sortBy], ""],
            },
          },
        },
      });

      pipeline.push({
        $sort: {
          sortValue: sortDirection,
          _id: -1,
        },
      });
    } else {
      const sortFieldMap = {
        price: "basePrice",
        createdAt: "createdAt",
      };

      const sortField = sortFieldMap[sortBy] || "createdAt";

      pipeline.push({
        $sort: {
          [sortField]: sortDirection,
          _id: -1,
        },
      });
    }
  } else {
    pipeline.push({
      $sort: {
        createdAt: -1,
      },
    });
  }
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      total: [{ $count: "count" }],
    },
  });

  const result = await MenuItems.aggregate(pipeline);
  const data = result[0]?.data || [];
  const total = result[0]?.total?.[0]?.count || 0;

  return {
    menuItems: data.map((item) => formatMenuItem(item, timezone)),
    meta: generateMeta(page, limit, total),
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
    "presetType",
    "brand",
    "amountQuantity",
    "quantityType",
    "servingSize",
    "availableDays",
    "daypart",
    "dietTags",
    "allergens",
    "cuisine",
    "isRecommended",
    "subCategory",
    "isTogo",
    "isRequiresOrderConfirmation",
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

  const populated = await menuItemRepo.findMenuItemById(id);
  return formatMenuItem(populated || menuItem, timezone);
};

const deleteMenuItem = async (id) => {
  const menuItem = await MenuItems.findById(id).select("_id status").lean();
  if (!menuItem || menuItem.status === "deleted") return null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { cascaded, totalCascaded } =
      await menuItemRepo.cascadeSoftDeleteMenuItemReferences(id, session);

    const updated = await menuItemRepo.findByIdAndUpdate(
      id,
      { status: "deleted" },
      session,
    );

    if (!updated) {
      await session.abortTransaction();
      return null;
    }

    await session.commitTransaction();

    return {
      menuItem: {
        _id: updated._id,
        title: updated.title,
        status: updated.status,
      },
      cascaded,
      totalCascaded,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const getDeleteConfirmation = async (id) => {
  const menuItem = await MenuItems.findById(id).select("_id title status").lean();
  if (!menuItem || menuItem.status === "deleted") return null;

  const impact = await menuItemRepo.findMenuItemDeleteReferences(id);

  return {
    menuItem: {
      _id: menuItem._id,
      title: menuItem.title,
      status: menuItem.status,
    },
    hasReferences: impact.hasReferences,
    totalReferences: impact.totalReferences,
    counts: impact.counts,
    references: impact.references,
    willCascadeOnDelete: impact.hasReferences,
  };
};

const getMenuItemDetails = async (id, timezone) => {
  const menuItem = await menuItemRepo.findMenuItemById(id);
  if (!menuItem) return null;
  return formatMenuItem(menuItem, timezone);
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
          { $match: { $expr: { $in: ["$_id", { $cond: [{ $isArray: "$$menu" }, "$$menu", ["$$menu"]] }] } } },
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


const updateSubCategoryBulk = async (data) => {
  const update = await MenuItems.updateMany(
    { subCategory: new mongoose.Types.ObjectId(data.oldSubCategory) },
    { $set: { subCategory: new mongoose.Types.ObjectId(data.newSubCategory) } }
  );
  return update;
};
module.exports = {
  createMenuItem,
  importMenuItems,
  getMenuItems,
  updateMenuItem,
  getMenuItemDetails,
  deleteMenuItem,
  getDeleteConfirmation,
  getMenuItemsByMenuId,
  getBundleMenuItems,
  updateSubCategoryBulk,
};
