const MenuSubcategory = require("@MenuSubcategoryModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const { cache, invalidate } = require("@redisCache");
const { default: mongoose } = require("mongoose");
const ACTIVE_MenuSubcategoryS_CACHE_KEY = "MenuSubcategory:active";
const buildMenuSubcategorysCacheKey = ({
  page = 1,
  skip = 0,
  limit = 10,
  status,
}) => {
  return `${ACTIVE_MenuSubcategoryS_CACHE_KEY}:page=${page}:skip=${skip}:limit=${limit}:status=${status}`;
};

const createMenuSubcategory = async (data) => {
  try {
    const MenuSubcategoryData = new MenuSubcategory(data);
    await MenuSubcategoryData.save();
    await invalidate(ACTIVE_MenuSubcategoryS_CACHE_KEY);
    return MenuSubcategoryData;
  } catch (err) {
    throw err;
  }
};

const getMenuSubcategorys = async ({
  isNullAllowed,
  timezone,
  page,
  limit,
  keyword,
  status,
  sortBy,
  sortOrder,
  summary,
  organization,
  companyOrganizer,
  skip,
}) => {
  // Coerce to a real boolean — query params often arrive as the string "false".
  const nullAllowed = isNullAllowed === true || isNullAllowed === "true";

  // The heavy lifting — builds the pipeline, runs it, assembles meta.
  const computeMenuSubcategorys = async () => {
    const pipeline = [];

    // Apply filters
    if (status) {
      pipeline.push({ $match: { status } });
    } else {
      pipeline.push({ $match: { status: { $ne: "deleted" } } });
    }

    const filters = [];
    if (organization) {
      filters.push(
        nullAllowed
          ? {
              $or: [
                { organization: { $in: organization } },
                { organization: null },
              ],
            }
          : { organization: { $in: organization } },
      );
    }
    if (companyOrganizer) {
      const companyOrganizerId = new mongoose.Types.ObjectId(companyOrganizer);
      filters.push(
        nullAllowed
          ? {
              $or: [
                { companyOrganizer: companyOrganizerId },
                { companyOrganizer: null },
              ],
            }
          : { companyOrganizer: companyOrganizerId },
      );
    }
    const combinedFilter = filters.length ? { $and: filters } : {};
    if (Object.keys(combinedFilter).length) {
      pipeline.push({ $match: combinedFilter });
    }

    if (keyword) {
      const keywordMatch = buildKeywordQueryFromModels(
        [{ schema: MenuSubcategory.schema }],
        keyword,
      );

      if (Object.keys(keywordMatch).length) {
        pipeline.push({ $match: keywordMatch });
      }
    }
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "companyOrganizer",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                firstName: 1,
                lastName: 1,
              },
            },
          ],
          as: "companyOrganizer",
        },
      },
      {
        $addFields: {
          companyOrganizer: {
            $ifNull: [{ $arrayElemAt: ["$companyOrganizer", 0] }, null],
          },
        },
      },
    );

    pipeline.push(
      {
        $lookup: {
          from: "organizations",
          localField: "organization",
          foreignField: "_id",
          pipeline: [
            {
              $project: {
                _id: 1,
                "basicInfo.name": 1,
              },
            },
          ],
          as: "organization",
        },
      },
      {
        $addFields: {
          organization: {
            $ifNull: [{ $arrayElemAt: ["$organization", 0] }, null],
          },
        },
      },
    );

    if (sortBy && sortOrder) {
      const sortField =
        sortBy === "title"
          ? "title"
          : sortBy === "status"
            ? "status"
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

    const result = await MenuSubcategory.aggregate(pipeline);

    const MenuSubcategorys = result[0]?.data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Additional counts for meta (active/inactive/total by userId as creator)
    const countFilters = [];
    if (organization) {
      countFilters.push(
        nullAllowed
          ? {
              $or: [
                { organization: { $in: organization } },
                { organization: null },
              ],
            }
          : { organization: { $in: organization } },
      );
    }
    if (companyOrganizer) {
      const companyOrganizerId = new mongoose.Types.ObjectId(companyOrganizer);
      countFilters.push(
        nullAllowed
          ? {
              $or: [
                { companyOrganizer: companyOrganizerId },
                { companyOrganizer: null },
              ],
            }
          : { companyOrganizer: companyOrganizerId },
      );
    }
    const combinedCountFilter = countFilters.length
      ? { $and: countFilters }
      : {};

    const [total, active, inactive] = await Promise.all([
      MenuSubcategory.countDocuments({
        ...combinedCountFilter,
        status: { $ne: "deleted" },
      }),
      MenuSubcategory.countDocuments({
        status: "active",
        ...combinedCountFilter,
      }),
      MenuSubcategory.countDocuments({
        status: "inactive",
        ...combinedCountFilter,
      }),
    ]);

    const meta = generateMeta(page, limit, totalFiltered);
    meta.MenuSubcategorysCount = { total, active, inactive };

    return { MenuSubcategorys, meta };
  };

  // Only cache when the result is "stable" — no dynamic filters/sorting.
  const isCacheable =
    !companyOrganizer &&
    !organization &&
    !sortBy &&
    !sortOrder &&
    !keyword &&
    !status;

  if (!isCacheable) {
    return computeMenuSubcategorys();
  }
  return cache({
    namespace: ACTIVE_MenuSubcategoryS_CACHE_KEY,
    params: {
      page,
      skip,
      limit,
      status: status ?? "all",
    },
    ttl: 60,
    fetchFn: computeMenuSubcategorys,
  });
};
const getMenuSubcategorysSummary = async ({
  timezone,
  page,
  limit,
  user,
  skip,
  organization,
  companyOrganizer,
}) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });

  pipeline.push({ $sort: { createdAt: -1 } });
  if (organization) {
    pipeline.push({
      $match: {
        $or: [{ organization: { $in: organization } }, { organization: null }],
      },
    });
  }
  if (companyOrganizer) {
    const companyOrganizerId = new mongoose.Types.ObjectId(companyOrganizer);
    pipeline.push({
      $match: {
        $or: [
          { companyOrganizer: companyOrganizerId },
          { companyOrganizer: null },
        ],
      },
    });
  }

  pipeline.push({
    $project: {
      _id: 1,
      title: 1,
    },
  });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await MenuSubcategory.aggregate(pipeline);

  let MenuSubcategorys = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    MenuSubcategory.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    MenuSubcategory.countDocuments({
      status: "active",
      ...(user && { user: user }),
    }),
    MenuSubcategory.countDocuments({
      status: "inactive",
      ...(user && { user: user }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.MenuSubcategorysCount = { total, active, inactive };

  return { MenuSubcategorys, meta };
};

const findMenuSubcategoryById = async (id) => {
  return MenuSubcategory.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_MenuSubcategoryS_CACHE_KEY);
  return MenuSubcategory.findByIdAndUpdate(id, data, { new: true });
};
module.exports = {
  createMenuSubcategory,
  getMenuSubcategorys,
  findMenuSubcategoryById,
  findByIdAndUpdate,
  getMenuSubcategorysSummary,
};
