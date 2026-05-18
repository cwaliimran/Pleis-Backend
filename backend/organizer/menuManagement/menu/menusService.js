// services/menuService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const Organizations = require("@OrganizationModel");
const Menus = require("@MenusModel");
const menuRepo = require("./menusRepository");
const mongoose = require("mongoose");
const { getOrganizationIdsByCompanyOrganizer } = require("../../../admin/organizations/organizationRepository");

const createMenu = async (data) => {
  return await menuRepo.createMenu(data);
};

// Populate organization data for menus, but merge into "organization" field
const getMenus = async ({ page, limit, keyword, status, userId, date, organization }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const organizationIds = await getOrganizationIdsByCompanyOrganizer(userId);

  const pipeline = [


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
  else if (organizationIds.length > 0) {
    pipeline.push({
      $match: {
        organization: { $in: organizationIds }
      }
    });
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
  console.log("id", id);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {

    const menu = await Menus.findById(id).session(session);
    if (!menu) throw new Error("menu_not_found");

    const allowedFields = [
      "title",
      "description",
      "organization",
      "status",
      "isOrderingEnabled",
    ];

    const updateData = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateData[key] = data[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      await session.commitTransaction();
      return menu;
    }


    // ✅ If activating → deactivate others
    if (updateData.status === "active") {
      const orgId = new mongoose.Types.ObjectId(menu.organization);
      const menuId = new mongoose.Types.ObjectId(menu._id);

      await Menus.updateMany(
        {
          organization: orgId,
          status: { $ne: "deleted" },
          _id: { $ne: menuId },
        },
        { $set: { status: "inactive" } },
        { session }
      );
    }

    Object.assign(menu, updateData);
    await menu.save({ session });

    await session.commitTransaction();
    return menu;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
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
    // if (menu.organization.toString() === organization.toString()) {
    //   throw new Error('Old and new organization cannot be the same');
    // }
    const now = new Date();

    const formattedDate = now.toLocaleDateString("en-CA"); // 2026-05-18
    const formattedTime = now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).replace(/:/g, "-"); // 09-55-39
    const duplicatedMenu = {
      ...menu.toObject(),
      _id: new mongoose.Types.ObjectId(),
      title: `${menu.title}-copy-${formattedDate}-${formattedTime}`,
      status: "inactive",
      organization: organization,
    };
    const savedDuplicatedMenu = await menuRepo.createDuplicatedMenu(duplicatedMenu, session);
    if (savedDuplicatedMenu.status === "active") {
      const orgId = new mongoose.Types.ObjectId(savedDuplicatedMenu.organization);
      const menuId = new mongoose.Types.ObjectId(savedDuplicatedMenu._id);
      await Menus.updateMany(
        {
          organization: orgId,
          status: { $ne: "deleted" },
          _id: { $ne: menuId },
        },
        { $set: { status: "inactive" } },
        { session }
      );
    }


    const menuItems = await menuRepo.getMenuItemsByMenuId(menuId, session);
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
