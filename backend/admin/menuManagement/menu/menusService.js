// services/menuService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const Organizations = require("@OrganizationModel");
const Menus = require("@MenusModel");
const menuRepo = require("./menusRepository");
const mongoose = require("mongoose");
const { getOrganizationIdsByCompanyOrganizer } = require("../../organizations/organizationRepository");

const createMenu = async (data) => {
  return await menuRepo.createMenu(data);
};

// Populate organization data for menus, but merge into "organization" field
const getMenus = async ({ page, limit, keyword, status, date, organizations, companyOrganizer }) => {
  // 3️⃣ Pagination setup
  const skip = limit === 0 ? 0 : (page - 1) * limit;
      let organizationIds = [];

      // 1️⃣ If organizations explicitly provided, use them directly
      if (Array.isArray(organizations) && organizations.length > 0) {
        organizationIds = organizations.map(id => new mongoose.Types.ObjectId(id));
        // 2️⃣ Otherwise, if companyOrganizer provided, get orgs created by it
      } else if (companyOrganizer) {
        organizationIds = await getOrganizationIdsByCompanyOrganizer(companyOrganizer);
        if (organizationIds.length === 0) {
          return {
            menus: [],
            meta: generateMeta(page, limit, 0, { total: 0, active: 0, inactive: 0 })
          };
        }
      }


      const pipeline = [
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
        { $unwind: { path: "$organizationData", preserveNullAndEmptyArrays: true } },
      ];

      // 4️⃣ Apply filters dynamically
      if (organizationIds.length > 0) {
        pipeline.push({
          $match: {
            organization: { $in: organizationIds }
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
          $match: { createdAt: { $gte: start, $lt: end } }
        });
      }

      // Keyword search across Menu and Organization fields
      const keywordMatch = buildKeywordQueryFromModels(
        [
          { schema: Menus.schema },
          { schema: Organizations.schema, prefix: "organizationData." }
        ],
        keyword
      );

      if (Object.keys(keywordMatch).length > 0) {
        pipeline.push({ $match: keywordMatch });
      }

      // Sort, merge, clean
      pipeline.push({ $sort: { createdAt: -1 } });
      pipeline.push(
        { $addFields: { organization: "$organizationData" } },
        { $project: { organizationData: 0 } }
      );

      // Pagination + count
      pipeline.push({
        $facet: {
          data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
          totalFiltered: [{ $count: "count" }]
        }
      });

      const result = await Menus.aggregate(pipeline);
      const menus = result[0]?.data || [];
      const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

      // 5️⃣ Counts for meta
      const baseFilter =
        organizationIds.length > 0
          ? { organization: { $in: organizationIds } }
          : {}; // ✅ fetch all if no orgs or organizer

      const [total, active, inactive] = await Promise.all([
        Menus.countDocuments({ ...baseFilter, status: { $ne: "deleted" } }),
        Menus.countDocuments({ ...baseFilter, status: "active" }),
        Menus.countDocuments({ ...baseFilter, status: "inactive" })
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
    "status",
    'isOrderingEnabled'
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

const getMenuNamesByCompanyOrganizer = async (companyOrganizer) => {
  return await menuRepo.getMenuNamesByCompanyOrganizer(companyOrganizer);
}

module.exports = {
  createMenu,
  getMenus,
  updateMenu,
  getMenuDetails,
  duplicateMenuAndItems,
  deleteMenu,
  getMenuNamesByCompanyOrganizer,
};
