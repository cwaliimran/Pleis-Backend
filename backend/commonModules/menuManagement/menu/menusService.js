// services/menuService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const Organizations = require("../../organizations/Organization");
const Menus = require("./Menus");
const menuRepo = require("./menusRepository");
const mongoose = require("mongoose");

const createMenu = async (data) => {
  return await menuRepo.createMenu(data);
};

// Populate organization data for menus, but merge into "organization" field
const getMenus = async ({ page, limit, keyword, status, userId, date, organization }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // Join with organizations collection
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
    // Flatten organizationData array for easier matching
    { $unwind: { path: "$organizationData", preserveNullAndEmptyArrays: true } },
    // Match user access (menu creator)
    {
      $match: {
        creator: new mongoose.Types.ObjectId(userId)
      }
    }
  ];

  // Apply filters
  if (organization) {
    pipeline.push({
      $match: {
        organization: new mongoose.Types.ObjectId(organization)
      }
    });
  }

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: Menus.schema },           // Menu fields
      { schema: Organizations.schema, prefix: 'organizationData.' } // Organization fields (with prefix)
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // Merge organizationData into organization field and remove organizationData
  pipeline.push({
    $addFields: {
      organization: "$organizationData"
    }
  });
  pipeline.push({
    $project: {
      organizationData: 0
    }
  });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await Menus.aggregate(pipeline);

  const menus = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Menus.countDocuments({ creator: userId, status: { $ne: "deleted" } }),
    Menus.countDocuments({ status: "active", creator: userId }),
    Menus.countDocuments({ status: "inactive", creator: userId })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.menusCount = { total, active, inactive };

  return {
    menus,
    meta
  };
};


const updateMenu = async (id, data) => {
  const menu = await menuRepo.findMenuById(id);
  if (!menu) return null;

  const allowedFields = [
    "title",
    "description",
    "organization",
    "status"
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
