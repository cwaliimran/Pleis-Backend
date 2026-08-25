// services/menuService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const Organizations = require("@OrganizationModel");
const Menus = require("@MenusModel");
const menuRepo = require("./menusRepository");
const mongoose = require("mongoose");
const {
  getOrganizationIdsByCompanyOrganizer,
  getOrganizationByCompanyOrganizer,
} = require("../../organizations/organizationRepository");

const createMenu = async (data) => {
  return await menuRepo.createMenu(data);
};

// Populate organization data for menus, but merge into "organization" field
const getMenus = async ({
  page,
  limit,
  keyword,
  status,
  date,
  organizations,
  companyOrganizer,
  sortBy,
  sortOrder,
  venue,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let organizationIds = [];

  if (organizations) {
    const orgList = Array.isArray(organizations)
      ? organizations.flatMap((org) => org.split(","))
      : organizations.split(",");

    organizationIds = orgList

      .map((org) => org.trim())

      .filter(Boolean)

      .map((org) => new mongoose.Types.ObjectId(org));

    if (orgList.length > 0) {
      organizationIds = orgList.map((id) => new mongoose.Types.ObjectId(id));
    }
  } else if (companyOrganizer) {
    organizationIds =
      await getOrganizationIdsByCompanyOrganizer(companyOrganizer);
    if (organizationIds.length === 0) {
      return {
        menus: [],
        meta: generateMeta(page, limit, 0, {
          total: 0,
          active: 0,
          inactive: 0,
        }),
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
              "basicInfo.name": 1,
            },
          },
        ],
      },
    },
    {
      $unwind: { path: "$organizationData", preserveNullAndEmptyArrays: true },
    },
    {
      $lookup: {
        from: "venues",
        let: { venueIds: "$venue" },
        pipeline: [
          {
            $match: {
              $expr: {
                $in: [
                  "$_id",
                  {
                    $map: {
                      input: { $ifNull: ["$$venueIds", []] },
                      as: "id",
                      in: { $toObjectId: "$$id" },
                    },
                  },
                ],
              },
            },
          },
          { $project: { _id: 1, title: 1 } },
        ],
        as: "venue",
      },
    },
  ];

  // 4️⃣ Apply filters dynamically
  if (organizationIds.length > 0) {
    pipeline.push({
      $match: {
        organization: { $in: organizationIds },
      },
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
      $match: { createdAt: { $gte: start, $lt: end } },
    });
  }

  // Keyword search across Menu and Organization fields
  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: Menus.schema },
      { schema: Organizations.schema, prefix: "organizationData." },
    ],
    keyword,
  );

  if (Object.keys(keywordMatch).length > 0) {
    pipeline.push({ $match: keywordMatch });
  }

  if (sortBy && sortOrder) {
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    if (sortBy === "menuName") {
      pipeline.push({
        $addFields: {
          menuNameSort: {
            $toLower: { $ifNull: ["$title", ""] },
          },
        },
      });

      pipeline.push({
        $sort: {
          menuNameSort: sortDirection,
          _id: sortDirection,
        },
      });
    } else if (sortBy === "organizationName") {
      pipeline.push({
        $addFields: {
          organizationNameSort: {
            $toLower: {
              $ifNull: ["$organizationData.basicInfo.name", ""],
            },
          },
        },
      });

      pipeline.push({
        $sort: {
          organizationNameSort: sortDirection,
          _id: sortDirection,
        },
      });
    } else if (sortBy === "description") {
      pipeline.push({
        $addFields: {
          descriptionSort: {
            $toLower: { $ifNull: ["$description", ""] },
          },
        },
      });

      pipeline.push({
        $sort: {
          descriptionSort: sortDirection,
          _id: sortDirection,
        },
      });
    } else if (sortBy === "createdAt") {
      pipeline.push({
        $sort: {
          createdAt: sortDirection,
          _id: sortDirection,
        },
      });
    } else {
      pipeline.push({
        $sort: {
          createdAt: -1,
          _id: -1,
        },
      });
    }
  } else {
    pipeline.push({
      $sort: {
        createdAt: -1,
        _id: -1,
      },
    });
  }

  // Sort, merge, clean

  pipeline.push(
    { $addFields: { organization: "$organizationData" } },
    { $project: { organizationData: 0 } },
  );

  // Pagination + count
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
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
    Menus.countDocuments({ ...baseFilter, status: "inactive" }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.menusCount = { total, active, inactive };

  return {
    menus,
    meta,
  };
};

const getMenusSummary = async ({
  page,
  limit,
  organizations,
  companyOrganizer,
}) => {
  console.log("organizations", organizations);
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let organizationIds = [];

  if (organizations) {
    const orgList = Array.isArray(organizations)
      ? organizations
      : [organizations];

    if (orgList.length > 0) {
      organizationIds = orgList.map((id) => new mongoose.Types.ObjectId(id));
    }
  } else if (companyOrganizer) {
    organizationIds =
      await getOrganizationIdsByCompanyOrganizer(companyOrganizer);

    if (organizationIds.length === 0) {
      return {
        menus: [],
        meta: generateMeta(page, limit, 0, {
          total: 0,
          active: 0,
          inactive: 0,
        }),
      };
    }
  }

  const pipeline = [];

  // 3️⃣ Apply filters
  if (organizationIds.length > 0) {
    pipeline.push({
      $match: { organization: { $in: organizationIds } },
    });
  }

  pipeline.push({ $match: { status: "active" } });

  // stable ordering so pagination doesn't repeat/skip records
  pipeline.push({ $sort: { createdAt: -1, _id: -1 } });

  // 4️⃣ Pagination + count
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
        { $project: { title: 1 } },
      ],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Menus.aggregate(pipeline);
  const menus = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  return { menus, meta };
};

const updateMenu = async (id, data) => {
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
      "venue",
      "startDate",
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
          status: "active",
          _id: { $ne: menuId },
        },
        { $set: { status: "inactive" } },
        { session },
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

const getTimezoneDateTime = (timezone = "Asia/Karachi") => {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;

  return {
    formattedDate: `${get("year")}-${get("month")}-${get("day")}`,
    formattedTime: `${get("hour")}-${get("minute")}-${get("second")}`,
  };
};

const duplicateMenuAndItems = async (menuId, organization, timezone, name) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Step 1: Duplicate the Menu
    const menu = await menuRepo.findMenuById(menuId);
    if (!menu) {
      throw new Error("Menu not found");
    }
    // if (menu.organization.toString() === organization.toString()) {
    //   throw new Error('Old and new organization cannot be the same');
    // }
    const { formattedDate, formattedTime } = getTimezoneDateTime(timezone);

    const duplicatedMenu = {
      ...menu.toObject(),
      _id: new mongoose.Types.ObjectId(),
      title: name || `${menu.title}-copy-${formattedDate}-${formattedTime}`,
      status: "inactive",
      organization: organization,
    };

    const savedDuplicatedMenu = await menuRepo.createDuplicatedMenu(
      duplicatedMenu,
      session,
    );
    if (savedDuplicatedMenu.status === "active") {
      const orgId = new mongoose.Types.ObjectId(
        savedDuplicatedMenu.organization,
      );
      const menuId = new mongoose.Types.ObjectId(savedDuplicatedMenu._id);
      await Menus.updateMany(
        {
          organization: orgId,
          status: { $ne: "deleted" },
          _id: { $ne: menuId },
        },
        { $set: { status: "inactive" } },
        { session },
      );
    }

    const menuItems = await menuRepo.getMenuItemsByMenuId(menuId, session);
    const duplicatedMenuItemsPromises = menuItems.map((item) => {
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
};

module.exports = {
  createMenu,
  getMenus,
  updateMenu,
  getMenuDetails,
  duplicateMenuAndItems,
  deleteMenu,
  getMenuNamesByCompanyOrganizer,
  getMenusSummary,
};
