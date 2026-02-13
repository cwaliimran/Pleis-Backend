// services/menuService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const Organizations = require("@OrganizationModel");
const Menus = require("@MenusModel");
const menuRepo = require("./menusRepository");
const mongoose = require("mongoose");

const createMenu = async (data) => {
  return await menuRepo.createMenu(data);
};

// Populate organization data for menus, but merge into "organization" field
const getMenus = async ({ page, limit, keyword, status, userId, date, organization }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // 🔐 Only menus created by this user
    {
      $match: {
        creator: new mongoose.Types.ObjectId(userId)
      }
    },

    // 🔗 Join organizations
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organizationData",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1
            }
          }
        ]
      }
    },

    // 📦 Flatten organization
    {
      $unwind: {
        path: "$organizationData",
        preserveNullAndEmptyArrays: true
      }
    }
  ];

  // --------------------
  // 🏢 Organization filter (comma / % / array)
  // --------------------
  if (organization) {
    let orgArray = [];

    if (Array.isArray(organization)) {
      orgArray = organization;
    } else if (typeof organization === "string") {
      orgArray = organization.split(/[, %]+/);
    }

    orgArray = orgArray
      .map(id => id.trim())
      .filter(id => mongoose.Types.ObjectId.isValid(id));

    if (orgArray.length) {
      pipeline.push({
        $match: {
          organization: {
            $in: orgArray.map(id => new mongoose.Types.ObjectId(id))
          }
        }
      });
    }
  }

  // --------------------
  // 📌 Status filter
  // --------------------
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  // --------------------
  // 📅 Date filter (full day)
  // --------------------
  if (date) {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);

    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lte: end }
      }
    });
  }

  // --------------------
  // 🔎 Keyword search
  // --------------------
  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: Menus.schema },
      { schema: Organizations.schema, prefix: "organizationData." }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  // --------------------
  // ⬇ Sort latest first
  // --------------------
  pipeline.push({ $sort: { createdAt: -1 } });

  // --------------------
  // 🧩 Merge organizationData → organization
  // --------------------
  pipeline.push(
    {
      $addFields: {
        organization: "$organizationData"
      }
    },
    {
      $project: {
        organizationData: 0
      }
    }
  );

  // --------------------
  // 📊 Pagination + count
  // --------------------
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  // --------------------
  // 🚀 Execute aggregation
  // --------------------
  const result = await Menus.aggregate(pipeline);

  const menus = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // --------------------
  // 📈 Meta counts
  // --------------------
  const [total, active, inactive] = await Promise.all([
    Menus.countDocuments({ creator: userId, status: { $ne: "deleted" } }),
    Menus.countDocuments({ creator: userId, status: "active" }),
    Menus.countDocuments({ creator: userId, status: "inactive" })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.menusCount = { total, active, inactive };

  return { menus, meta };
};


const updateMenu = async (id, data) => {
  const menu = await menuRepo.findMenuById(id);
  if (!menu) return null;

  const allowedFields = [
    "title",
    "description",
    "organization",
    "status",
    "isOrderingEnabled"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return menu; // nothing to update
  }

  Object.assign(menu, updateData);
  await menu.save();

  return menu;
};

const deleteMenu = async (id) => {
  const updated = await menuRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getMenuDetails = async (id) => {
  const menu = await menuRepo.findMenuById(id);
  if (!menu) return null;
  return menu;
};


const duplicateMenuAndItems = async (menuId, organization) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Step 1: Duplicate the Menu
    const menu = await menuRepo.findMenuById(menuId);
    if (!menu) {
      throw new Error('Menu not found');
    }

    if (menu.organization.toString() === organization.toString()) {
      throw new Error('Old and new organization cannot be the same');
    }

    const duplicatedMenu = {
      ...menu.toObject(),
      _id: new mongoose.Types.ObjectId(),
      title: `${menu.title}`,
      organization: organization,
    };

    const savedDuplicatedMenu = await menuRepo.createDuplicatedMenu(duplicatedMenu, session);

    // Step 2: Duplicate the Menu Items
    const menuItems = await menuRepo.getMenuItemsByMenuId(menu, session);

    const duplicatedMenuItemsPromises = menuItems.map(item => {
      const duplicatedItem = {
        ...item.toObject(),
        _id: new mongoose.Types.ObjectId(),
        menu: savedDuplicatedMenu._id,
      };
      return menuRepo.createDuplicatedMenuItem(duplicatedItem, session);
    });

    await Promise.all(duplicatedMenuItemsPromises);

    await session.commitTransaction();
    session.endSession();

    return savedDuplicatedMenu;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

module.exports = {
  createMenu,
  getMenus,
  updateMenu,
  getMenuDetails,
  duplicateMenuAndItems,
  deleteMenu,
};
