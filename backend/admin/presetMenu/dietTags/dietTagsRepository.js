const DietTags = require("@DietTagsModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_DietTagsS_CACHE_KEY = "DietTags:active";


const createDietTags = async (data) => {
  try {
    const dietTags = new DietTags(data);
    await dietTags.save();
    await invalidate(ACTIVE_DietTagsS_CACHE_KEY);
    return dietTags;
  } catch (err) {
    throw err;
  }
};

const getDietTagss = async ({
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
}) => {
  // The heavy lifting — builds the pipeline, runs it, assembles meta.
  const computeDietTagss = async () => {
    const pipeline = [];

    // Apply filters
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
          createdAt: { $gte: start, $lt: end },
        },
      });
    }

    if (keyword) {
      const keywordMatch = buildKeywordQueryFromModels(
        [{ schema: DietTags.schema }],
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

    const result = await DietTags.aggregate(pipeline);

    const DietTagss = result[0]?.data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Additional counts for meta (active/inactive/total by userId as creator)
    const [total, active, inactive] = await Promise.all([
      DietTags.countDocuments({
        ...(user && { user: user }),
        status: { $ne: "deleted" },
      }),
      DietTags.countDocuments({ status: "active", ...(user && { user: user }) }),
      DietTags.countDocuments({
        status: "inactive",
        ...(user && { user: user }),
      }),
    ]);

    const meta = generateMeta(page, limit, totalFiltered);
    meta.DietTagssCount = { total, active, inactive };

    return { DietTagss, meta };
  };

  // Only cache when the result is "stable" — no dynamic filters/sorting.
  const isCacheable = !date && !sortBy && !sortOrder && !keyword;

  if (!isCacheable) {
    return computeDietTagss();
  }

  return cache({
    namespace: ACTIVE_DietTagsS_CACHE_KEY,
    params: {
      page,
      skip,
      limit,
      status: status ?? "all",
    },
    ttl: 60,
    fetchFn: computeDietTagss,
  });
};
const getDietTagssSummary = async ({ timezone, page, limit, user, skip }) => {
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

  const result = await DietTags.aggregate(pipeline);

  let DietTagss = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    DietTags.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    DietTags.countDocuments({ status: "active", ...(user && { user: user }) }),
    DietTags.countDocuments({ status: "inactive", ...(user && { user: user }) }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.DietTagssCount = { total, active, inactive };

  return { DietTagss, meta };
};

const findDietTagsById = async (id) => {
  return DietTags.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_DietTagsS_CACHE_KEY);
  return DietTags.findByIdAndUpdate(id, data, { new: true });
};
const generateUniqueDietTagsCode = async () => {
  const docs = await DietTags.find({ code: { $regex: /^DIET\d+$/i } })
    .select("code")
    .lean();

  let highest = 0;
  for (const doc of docs) {
    const n = Number(String(doc.code).replace(/^DIET/i, ""));
    if (!Number.isNaN(n) && n > highest) highest = n;
  }

  return `DIET${String(highest + 1).padStart(3, "0")}`;
};
module.exports = {
  createDietTags,
  getDietTagss,
  findDietTagsById,
  findByIdAndUpdate,
  getDietTagssSummary,
  generateUniqueDietTagsCode,
};
