const Serving = require("@ServingModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_ServingS_CACHE_KEY = "Serving:active";
const buildServingsCacheKey = ({ page = 1, skip = 0, limit = 10, status }) => {
  return `${ACTIVE_ServingS_CACHE_KEY}:page=${page}:skip=${skip}:limit=${limit}:status=${status}`;
};

const createServing = async (data) => {
  try {
    const serving = new Serving(data);
    await serving.save();
    await invalidate(ACTIVE_ServingS_CACHE_KEY);
    return serving;
  } catch (err) {
    throw err;
  }
};

const getServings = async ({
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
  const computeServings = async () => {
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
        [{ schema: Serving.schema }],
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

    const result = await Serving.aggregate(pipeline);

    const Servings = result[0]?.data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Additional counts for meta (active/inactive/total by userId as creator)
    const [total, active, inactive] = await Promise.all([
      Serving.countDocuments({
        ...(user && { user: user }),
        status: { $ne: "deleted" },
      }),
      Serving.countDocuments({ status: "active", ...(user && { user: user }) }),
      Serving.countDocuments({
        status: "inactive",
        ...(user && { user: user }),
      }),
    ]);

    const meta = generateMeta(page, limit, totalFiltered);
    meta.ServingsCount = { total, active, inactive };

    return { Servings, meta };
  };

  // Only cache when the result is "stable" — no dynamic filters/sorting.
  const isCacheable = !date && !sortBy && !sortOrder && !keyword;

  if (!isCacheable) {
    return computeServings();
  }
  return cache({
    namespace: ACTIVE_ServingS_CACHE_KEY,
    params: {
      page,
      skip,
      limit,
      status: status ?? "all",
    },
    ttl: 60,
    fetchFn: computeServings,
  });
};
const getServingsSummary = async ({ timezone, page, limit, user, skip }) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $project: {
      _id: 1,
      type: 1,
      code: 1,
      unit: 1,
      level2: 1,
    },
  });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Serving.aggregate(pipeline);

  let Servings = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Serving.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    Serving.countDocuments({ status: "active", ...(user && { user: user }) }),
    Serving.countDocuments({ status: "inactive", ...(user && { user: user }) }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.ServingsCount = { total, active, inactive };

  return { Servings, meta };
};

const findServingById = async (id) => {
  return Serving.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_ServingS_CACHE_KEY);
  return Serving.findByIdAndUpdate(id, data, { new: true });
};
const generateUniqueServingCode = async () => {
  const docs = await Serving.find({ code: { $regex: /^SERV\d+$/i } })
    .select("code")
    .lean();

  let highest = 0;
  for (const doc of docs) {
    const n = Number(String(doc.code).replace(/^SERV/i, ""));
    if (!Number.isNaN(n) && n > highest) highest = n;
  }

  return `SERV${String(highest + 1).padStart(3, "0")}`;
};
module.exports = {
  createServing,
  getServings,
  findServingById,
  findByIdAndUpdate,
  getServingsSummary,
  generateUniqueServingCode,
};
