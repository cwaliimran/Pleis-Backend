const presetType = require("@PresetTypeModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_presetTypeS_CACHE_KEY = "presetType:active";

const createpresetType = async (data) => {
  try {
    const presetTypeData = new presetType(data);
    await presetTypeData.save();
    await invalidate(ACTIVE_presetTypeS_CACHE_KEY);
    return presetTypeData;
  } catch (err) {
    throw err;
  }
};

const getpresetTypes = async ({
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
  subCategory,
  type,
}) => {
  // The heavy lifting — builds the pipeline, runs it, assembles meta.
  const computepresetTypes = async () => {
    const pipeline = [];

    // Apply filters
    if (status) {
      pipeline.push({ $match: { status } });
    } else {
      pipeline.push({ $match: { status: { $ne: "deleted" } } });
    }
    if (category) {
      pipeline.push({
        $match: { category: new mongoose.Types.ObjectId(category) },
      });
    }
    if (subCategory) {
      pipeline.push({
        $match: { subCategory: new mongoose.Types.ObjectId(subCategory) },
      });
    }
    if (type) {
      pipeline.push({ $match: { type: new mongoose.Types.ObjectId(type) } });
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
    // Resolve category via subcategory when PresetType.category is missing
    pipeline.push(
      {
        $lookup: {
          from: "menuitemsubcategories",
          localField: "subCategory",
          foreignField: "_id",
          as: "subCategory",
          pipeline: [
            { $project: { name: 1, code: 1, status: 1, category: 1 } },
          ],
        },
      },
      {
        $unwind: {
          path: "$subCategory",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          // Prefer subcategory's category — PresetType may hold a stale/wrong ID
          category: { $ifNull: ["$subCategory.category", "$category"] },
        },
      },
    );
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
        $unwind: {
          path: "$category",
          preserveNullAndEmptyArrays: true,
        },
      },
      { $unset: "subCategory.category" },
    );
    pipeline.push(
      {
        $lookup: {
          from: "menuitemsubcategorytypes",
          localField: "type",
          foreignField: "_id",
          as: "type",
          pipeline: [{ $project: { name: 1, code: 1, status: 1 } }],
        },
      },
      {
        $unwind: {
          path: "$type",
          preserveNullAndEmptyArrays: true,
        },
      },
    );

    if (keyword) {
      const keywordMatch = buildKeywordQueryFromModels(
        [{ schema: presetType.schema }],
        keyword,
      );

      if (Object.keys(keywordMatch).length) {
        pipeline.push({ $match: keywordMatch });
      }
    }

    if (sortBy && sortOrder) {
      const sortField =
        sortBy === "code"
          ? "code"
          : sortBy === "type"
            ? "type"
            : sortBy === "category"
              ? "category"
              : sortBy === "subCategory"
                ? "subCategory"
                : sortBy === "name"
                  ? "name"
                  : sortBy === "description"
                    ? "description"
                    : sortBy === "status"
                      ? "status"
                      : sortBy === "level2"
                        ? "level2"
                        : sortBy === "unit"
                          ? "unit"
                          : sortBy === "createdAt"
                            ? "createdAt"
                            : "createdAt"; // Default sort field
      const sortDirection = sortOrder === "asc" ? 1 : -1;
      pipeline.push({ $sort: { [sortField]: sortDirection } });
    } else {
      pipeline.push({ $sort: { createdAt: -1 } });
    }

    // Apply pagination + counts using $facet
    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
        totalFiltered: [{ $count: "count" }],
      },
    });

    const result = await presetType.aggregate(pipeline);

    const presetTypes = result[0]?.data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Additional counts for meta (active/inactive/total by userId as creator)
    const [total, active, inactive] = await Promise.all([
      presetType.countDocuments({
        ...(user && { user: user }),
        status: { $ne: "deleted" },
      }),
      presetType.countDocuments({
        status: "active",
        ...(user && { user: user }),
      }),
      presetType.countDocuments({
        status: "inactive",
        ...(user && { user: user }),
      }),
    ]);

    const meta = generateMeta(page, limit, totalFiltered);
    meta.presetTypesCount = { total, active, inactive };

    return { presetTypes, meta };
  };

  return computepresetTypes();
};
const getpresetTypesSummary = async ({ timezone, page, limit, user, skip }) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });

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

  const result = await presetType.aggregate(pipeline);

  let presetTypes = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    presetType.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    presetType.countDocuments({
      status: "active",
      ...(user && { user: user }),
    }),
    presetType.countDocuments({
      status: "inactive",
      ...(user && { user: user }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.presetTypesCount = { total, active, inactive };

  return { presetTypes, meta };
};

const findpresetTypeById = async (id) => {
  return presetType.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_presetTypeS_CACHE_KEY);
  return presetType.findByIdAndUpdate(id, data, { new: true });
};
const generateUniquepresetTypeCode = async () => {
  const docs = await presetType
    .find({ code: /^PIC\d+$/ })
    .select("code")
    .lean();

  const highest = docs.reduce((max, { code }) => {
    const n = parseInt(code.slice(3), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `PIC${String(highest + 1).padStart(3, "0")}`;
};
module.exports = {
  createpresetType,

  getpresetTypes,
  findpresetTypeById,
  findByIdAndUpdate,
  getpresetTypesSummary,
  generateUniquepresetTypeCode,
};
