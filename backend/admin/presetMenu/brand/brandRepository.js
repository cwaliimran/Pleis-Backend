const Brand = require("@BrandModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_BRANDS_CACHE_KEY = "Brand:active";
const buildBrandsCacheKey = ({ page = 1, skip = 0, limit = 10, status }) => {
  return `${ACTIVE_BRANDS_CACHE_KEY}:page=${page}:skip=${skip}:limit=${limit}:status=${status}`;
};

const createBrand = async (data) => {
  try {
    const brand = new Brand(data);
    await brand.save();
    await invalidate(ACTIVE_BRANDS_CACHE_KEY);
    return brand;
  } catch (err) {
    throw err;
  }
};

const getBrands = async ({
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
  const computeBrands = async () => {
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
        [{ schema: Brand.schema }],
        keyword,
      );

      if (Object.keys(keywordMatch).length) {
        pipeline.push({ $match: keywordMatch });
      }
    }

    if (sortBy && sortOrder) {
      const sortField =
        sortBy === "name"
          ? "name"
          : sortBy === "brandOwner"
            ? "brandOwner"
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

    const result = await Brand.aggregate(pipeline);

    const Brands = result[0]?.data || [];
    const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

    // Additional counts for meta (active/inactive/total by userId as creator)
    const [total, active, inactive] = await Promise.all([
      Brand.countDocuments({
        ...(user && { user: user }),
        status: { $ne: "deleted" },
      }),
      Brand.countDocuments({ status: "active", ...(user && { user: user }) }),
      Brand.countDocuments({ status: "inactive", ...(user && { user: user }) }),
    ]);

    const meta = generateMeta(page, limit, totalFiltered);
    meta.BrandsCount = { total, active, inactive };

    return { Brands, meta };
  };

  // Only cache when the result is "stable" — no dynamic filters/sorting.
  const isCacheable = !date && !sortBy && !sortOrder && !keyword;

  if (!isCacheable) {
    return computeBrands();
  }
  return cache({
    namespace: ACTIVE_BRANDS_CACHE_KEY,
    params: {
      page,
      skip,
      limit,
      status: status ?? "all",
    },
    ttl: 60,
    fetchFn: computeBrands,
  });
};
const getBrandsSummary = async ({ timezone, page, limit, user, skip, keyword }) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });
    if (keyword) {
      const keywordMatch = buildKeywordQueryFromModels(
        [{ schema: Brand.schema }],
        keyword,
      );
  
      if (Object.keys(keywordMatch).length) {
        pipeline.push({ $match: keywordMatch });
      }
    }

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $project: {
      _id: 1,
      name: 1,
      brandOwner: 1,
    },
  });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Brand.aggregate(pipeline);

  let Brands = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Brand.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    Brand.countDocuments({ status: "active", ...(user && { user: user }) }),
    Brand.countDocuments({ status: "inactive", ...(user && { user: user }) }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.BrandsCount = { total, active, inactive };

  return { Brands, meta };
};

const findBrandById = async (id) => {
  return Brand.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_BRANDS_CACHE_KEY);
  return Brand.findByIdAndUpdate(id, data, { new: true });
};
module.exports = {
  createBrand,
  getBrands,
  findBrandById,
  findByIdAndUpdate,
  getBrandsSummary,
};
