const Daypart = require("@DaypartModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_DaypartS_CACHE_KEY = "Daypart:active";


const createDaypart = async (data) => {
  try {
    const DaypartData = new Daypart(data);
    await DaypartData.save();
    await invalidate(ACTIVE_DaypartS_CACHE_KEY);
    return DaypartData;
  } catch (err) {
    throw err;
  }
};

const getDayparts = async ({
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
  const computeDayparts = async () => {
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
        [{ schema: Daypart.schema }],
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

    const result = await Daypart.aggregate(pipeline);

    const Dayparts = result[0]?.data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Additional counts for meta (active/inactive/total by userId as creator)
    const [total, active, inactive] = await Promise.all([
      Daypart.countDocuments({
        ...(user && { user: user }),
        status: { $ne: "deleted" },
      }),
      Daypart.countDocuments({ status: "active", ...(user && { user: user }) }),
      Daypart.countDocuments({
        status: "inactive",
        ...(user && { user: user }),
      }),
    ]);

    const meta = generateMeta(page, limit, totalFiltered);
    meta.DaypartsCount = { total, active, inactive };

    return { Dayparts, meta };
  };

  // Only cache when the result is "stable" — no dynamic filters/sorting.
  const isCacheable = !date && !sortBy && !sortOrder && !keyword;

  if (!isCacheable) {
    return computeDayparts();
  }
  console.log("ACTIVE_DaypartS_CACHE_KEY",ACTIVE_DaypartS_CACHE_KEY);
  return cache({
    namespace: ACTIVE_DaypartS_CACHE_KEY,
    params: {
      page,
      skip,
      limit,
      status: status ?? "all",
    },
    ttl: 60,
    fetchFn: computeDayparts,
  });
};
const getDaypartsSummary = async ({ timezone, page, limit, user, skip }) => {
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

  const result = await Daypart.aggregate(pipeline);

  let Dayparts = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Daypart.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    Daypart.countDocuments({ status: "active", ...(user && { user: user }) }),
    Daypart.countDocuments({ status: "inactive", ...(user && { user: user }) }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.DaypartsCount = { total, active, inactive };

  return { Dayparts, meta };
};

const findDaypartById = async (id) => {
  return Daypart.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_DaypartS_CACHE_KEY);
  return Daypart.findByIdAndUpdate(id, data, { new: true });
};
const generateUniqueDaypartCode = async () => {
  const last = await Daypart.findOne({})
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
module.exports = {
  createDaypart,
  getDayparts,
  findDaypartById,
  findByIdAndUpdate,
  getDaypartsSummary,
  generateUniqueDaypartCode,
};
