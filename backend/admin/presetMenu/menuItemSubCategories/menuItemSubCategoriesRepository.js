const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const MenuItemSubCategory = require("@MenuItemSubCategoriesModel");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_MenuItemSubCategoryS_CACHE_KEY = "MenuItemSubCategory:active";

const createMenuItemSubCategory = async (data) => {
  try {
    const MenuItemSubCategoryData = new MenuItemSubCategory(data);
    await MenuItemSubCategoryData.save();
    await invalidate(ACTIVE_MenuItemSubCategoryS_CACHE_KEY);
    return MenuItemSubCategoryData;
  } catch (err) {
    throw err;
  }
};

const getMenuItemSubCategorys = async ({
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
  category,
}) => {
  // The heavy lifting — builds the pipeline, runs it, assembles meta.
  const computeMenuItemSubCategorys = async () => {
    const pipeline = [];

    // Apply filters
    if (status) {
      pipeline.push({ $match: { status } });
    } else {
      pipeline.push({ $match: { status: { $ne: "deleted" } } });
    }
    if (category) {
      pipeline.push({ $match: { category: new mongoose.Types.ObjectId(category) } });
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
        [{ schema: MenuItemSubCategory.schema }],
        keyword,
      );

      if (Object.keys(keywordMatch).length) {
        pipeline.push({ $match: keywordMatch });
      }
    }
    pipeline.push(
      {
        $lookup: {
          from: "menuitemcategories",
          localField: "category",
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
      const sortStage = { [sortField]: sortDirection };
      if (sortField === "order") {
        sortStage.updatedAt = 1;
        sortStage._id = 1;
      }
      pipeline.push({ $sort: sortStage });
    } else {
      pipeline.push({ $sort: { order: 1, updatedAt: 1, _id: 1 } });
    }

    // Apply pagination + counts using $facet
    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
        totalFiltered: [{ $count: "count" }],
      },
    });

    const result = await MenuItemSubCategory.aggregate(pipeline);

    const MenuItemSubCategorys = result[0]?.data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Additional counts for meta (active/inactive/total by userId as creator)
    const [total, active, inactive] = await Promise.all([
      MenuItemSubCategory.countDocuments({
        ...(user && { user: user }),
        status: { $ne: "deleted" },
        ...(category && { category: new mongoose.Types.ObjectId(category) }),
      }),
      MenuItemSubCategory.countDocuments({
        status: "active",
        ...(user && { user: user }),
        ...(category && { category: new mongoose.Types.ObjectId(category) }),
      }),
      MenuItemSubCategory.countDocuments({
        status: "inactive",
        ...(user && { user: user }),
        ...(category && { category: new mongoose.Types.ObjectId(category) }),
      }),
    ]);

    const meta = generateMeta(page, limit, totalFiltered);
    meta.MenuItemSubCategorysCount = { total, active, inactive };

    return { MenuItemSubCategorys, meta };
  };

  return computeMenuItemSubCategorys();
};
const getMenuItemSubCategorysSummary = async ({
  timezone,
  page,
  limit,
  user,
  skip,
  category
}) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });
  if (category) {
    pipeline.push({ $match: { category: new mongoose.Types.ObjectId(category) } });
  }

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

  const result = await MenuItemSubCategory.aggregate(pipeline);

  let MenuItemSubCategorys = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    MenuItemSubCategory.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
      ...(category && { category: new mongoose.Types.ObjectId(category) }),
    }),
    MenuItemSubCategory.countDocuments({
      status: "active",
      ...(user && { user: user }),
      ...(category && { category: new mongoose.Types.ObjectId(category) }),
    }),
    MenuItemSubCategory.countDocuments({
      status: "inactive",
      ...(user && { user: user }),
      ...(category && { category: new mongoose.Types.ObjectId(category) }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.MenuItemSubCategorysCount = { total, active, inactive };

  return { MenuItemSubCategorys, meta };
};

const findMenuItemSubCategoryById = async (id) => {
  return MenuItemSubCategory.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_MenuItemSubCategoryS_CACHE_KEY);
  return MenuItemSubCategory.findByIdAndUpdate(id, data, { new: true });
};
const generateUniqueMenuItemSubCategoryCode = async () => {
  const last = await MenuItemSubCategory.findOne({})
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



const reorderMenuItemSubCategory = async (movedId, newOrder) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const moved = await MenuItemSubCategory.findById(
      new mongoose.Types.ObjectId(movedId),
      null,
      { session },
    );

    if (!moved || moved.status === "deleted") {
      throw new Error("Subcategory not found");
    }

    const siblings = await MenuItemSubCategory.find(
      { user: moved.user, status: { $ne: "deleted" } },
      { _id: 1, order: 1 },
      { session },
    ).sort({ order: 1, updatedAt: 1, _id: 1 });

    const currentIndex = siblings.findIndex((s) => s._id.equals(moved._id));
    if (currentIndex === -1) throw new Error("Subcategory not found");

    const [item] = siblings.splice(currentIndex, 1);
    const targetIndex = Math.max(
      0,
      Math.min(Math.round(Number(newOrder)) - 1, siblings.length),
    );
    siblings.splice(targetIndex, 0, item);

    const now = new Date();
    const ops = siblings
      .map((doc, i) => ({ doc, order: i + 1 }))
      .filter(({ doc, order }) => doc.order !== order)
      .map(({ doc, order }) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: { order, updatedAt: now } },
        },
      }));

    if (ops.length) {
      await MenuItemSubCategory.bulkWrite(ops, { session });
    }

    await session.commitTransaction();
    session.endSession();
    await invalidate(ACTIVE_MenuItemSubCategoryS_CACHE_KEY);

    moved.order = targetIndex + 1;
    moved.updatedAt = now;
    return moved;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
module.exports = {
  createMenuItemSubCategory,
  getMenuItemSubCategorys,
  findMenuItemSubCategoryById,
  findByIdAndUpdate,
  getMenuItemSubCategorysSummary,
  generateUniqueMenuItemSubCategoryCode,
  reorderMenuItemSubCategory,
};
