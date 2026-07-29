const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const MenuItemSubCategoryType = require("@MenuItemSubCategoryTypeModel");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_MenuItemSubCategoryTypeS_CACHE_KEY =
  "MenuItemSubCategoryType:active";

const createMenuItemSubCategoryType = async (data) => {
  try {
    const MenuItemSubCategoryTypeData = new MenuItemSubCategoryType(data);
    await MenuItemSubCategoryTypeData.save();
    await invalidate(ACTIVE_MenuItemSubCategoryTypeS_CACHE_KEY);
    return MenuItemSubCategoryTypeData;
  } catch (err) {
    throw err;
  }
};

const getMenuItemSubCategoryTypes = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  date,
  skip,
  sortBy,
  sortOrder,
  subCategory,
}) => {
  // The heavy lifting — builds the pipeline, runs it, assembles meta.
  const computeMenuItemSubCategoryTypes = async () => {
    const pipeline = [];

    // Apply filters
    if (status) {
      pipeline.push({ $match: { status } });
    } else {
      pipeline.push({ $match: { status: { $ne: "deleted" } } });
    }
    if (subCategory) {
      pipeline.push({ $match: { subCategory: new mongoose.Types.ObjectId(subCategory) } });
    }

    if (date) {
      const start = new Date(date);
      const end = new Date(new Date(date).setDate(start.getDate() + 1));
      pipeline.push({
        $match: {
          createdAt: { $gte: start, $lt: end },
        },
      });
    }

    if (keyword) {
      const keywordMatch = buildKeywordQueryFromModels(
        [{ schema: MenuItemSubCategoryType.schema }],
        keyword,
      );

      if (Object.keys(keywordMatch).length) {
        pipeline.push({ $match: keywordMatch });
      }
    }
    pipeline.push(
      {
        $lookup: {
          from: "menuitemsubcategories",
          localField: "subCategory",
          foreignField: "_id",
          as: "subCategory",
          pipeline: [{ $project: { name: 1, status: 1, category: 1 } }],
        },
      },
      {
        $unwind: { path: "$subCategory", preserveNullAndEmptyArrays: true },
      },
    );
    pipeline.push(
      {
        $lookup: {
          from: "menuitemcategories",
          localField: "subCategory.category",
          foreignField: "_id",
          as: "category",
          pipeline: [{ $project: { title: 1, status: 1 } }],
        },
      },
      {
        $unwind: { path: "$category", preserveNullAndEmptyArrays: true },
      },
    );

    if (sortBy && sortOrder) {
      const sortField =
        sortBy === "name"
          ? "name"
          : sortBy === "category"
            ? "category.title"
            : sortBy === "status"
              ? "status"
              : sortBy === "order"
                ? "order"
                : sortBy === "createdAt"
                  ? "createdAt"
                  : "order"; // Default sort field
      const sortDirection = sortOrder === "asc" ? 1 : -1;
      pipeline.push({ $sort: { [sortField]: sortDirection } });
    } else {
      pipeline.push({ $sort: { order: 1 } });
    }

    // Apply pagination + counts using $facet
    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
        totalFiltered: [{ $count: "count" }],
      },
    });

    const result = await MenuItemSubCategoryType.aggregate(pipeline);

    const MenuItemSubCategoryTypes = result[0]?.data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Additional counts for meta (active/inactive/total by userId as creator)
    const [total, active, inactive] = await Promise.all([
      MenuItemSubCategoryType.countDocuments({
        ...(user && { user: user }),
        status: { $ne: "deleted" },
        ...(subCategory && { subCategory: new mongoose.Types.ObjectId(subCategory) }),
      }),
      MenuItemSubCategoryType.countDocuments({
        status: "active",
        ...(user && { user: user }),
        ...(subCategory && { subCategory: new mongoose.Types.ObjectId(subCategory) }),
      }),
      MenuItemSubCategoryType.countDocuments({
        status: "inactive",
        ...(user && { user: user }),
        ...(subCategory && { subCategory: new mongoose.Types.ObjectId(subCategory) }),
      }),
    ]);

    const meta = generateMeta(page, limit, totalFiltered);
    meta.MenuItemSubCategoryTypesCount = { total, active, inactive };

    return { MenuItemSubCategoryTypes, meta };
  };

  return computeMenuItemSubCategoryTypes();
};
const getMenuItemSubCategoryTypesSummary = async ({
  timezone,
  page,
  limit,
  user,
  skip,
  subCategory,
}) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active", subCategory: new mongoose.Types.ObjectId(subCategory) } });

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $project: {
      _id: 1,
      name: 1,
      code: 1,
    },
  });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await MenuItemSubCategoryType.aggregate(pipeline);

  let MenuItemSubCategoryTypes = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    MenuItemSubCategoryType.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
      subCategory: new mongoose.Types.ObjectId(subCategory),
    }),
    MenuItemSubCategoryType.countDocuments({
      status: "active",
      ...(user && { user: user }),
      subCategory: new mongoose.Types.ObjectId(subCategory),
    }),
    MenuItemSubCategoryType.countDocuments({
      status: "inactive",
      ...(user && { user: user }),
      subCategory: new mongoose.Types.ObjectId(subCategory),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.MenuItemSubCategoryTypesCount = { total, active, inactive };

  return { MenuItemSubCategoryTypes, meta };
};

const findMenuItemSubCategoryTypeById = async (id) => {
  return MenuItemSubCategoryType.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_MenuItemSubCategoryTypeS_CACHE_KEY);
  return MenuItemSubCategoryType.findByIdAndUpdate(id, data, { new: true });
};
const generateUniqueMenuItemSubCategoryTypeCode = async () => {
  const last = await MenuItemSubCategoryType.findOne({})
    .sort({ createdAt: -1 })
    .select("code")
    .lean();

  let nextNumber = 1;

  if (last?.code) {
    const currentNumber = Number(last.code.replace("DP", ""));

    if (!Number.isNaN(currentNumber)) {
      nextNumber = currentNumber + 1;
    }
  }

  return `DP${String(nextNumber).padStart(3, "0")}`;
};

const reorderMenuItemSubCategoryType = async (movedId, newIndex, user) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  console.log("movedId", movedId, "newIndex", newIndex, " user", user);

  try {
    const moved = await MenuItemSubCategoryType.findOne(
      { _id: new mongoose.Types.ObjectId(movedId), user },
      null,
      { session },
    );

    if (!moved) throw new Error("SubCategoryType not found");

    // include deleted so their slots aren't reused
    const siblings = await MenuItemSubCategoryType.find(
      { user, category: moved.category },
      { _id: 1, order: 1 },
      { session },
    ).sort({ order: 1, createdAt: 1 });

    const currentIndex = siblings.findIndex((s) => s._id.equals(movedId));
    const targetIndex = Math.max(0, Math.min(newIndex, siblings.length - 1));

    if (currentIndex === targetIndex) {
      await session.commitTransaction();
      session.endSession();
      return true;
    }

    // snapshot the existing order values in sorted position — this is the pool
    const orderPool = siblings.map((s) => s.order);

    const [item] = siblings.splice(currentIndex, 1);
    siblings.splice(targetIndex, 0, item);

    const ops = siblings
      .map((doc, i) => ({ doc, order: orderPool[i] }))
      .filter(({ doc, order }) => doc.order !== order)
      .map(({ doc, order }) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { order } },
        },
      }));

    if (ops.length) {
      await MenuItemSubCategoryType.bulkWrite(ops, { session });
    }

    await session.commitTransaction();
    session.endSession();
    await invalidate(ACTIVE_MenuItemSubCategoryTypeS_CACHE_KEY);
    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
module.exports = {
  createMenuItemSubCategoryType,
  getMenuItemSubCategoryTypes,
  findMenuItemSubCategoryTypeById,
  findByIdAndUpdate,
  getMenuItemSubCategoryTypesSummary,
  generateUniqueMenuItemSubCategoryTypeCode,
  reorderMenuItemSubCategoryType,
};
