const { generateMeta } = require("../../helperUtils/responseUtil");
const bundleRepo = require("./bundleRepository");
const { formatBundle } = require("./formatters/bundleFormatter");

const createBundleService = async (data, timezone) => {
  let bundle = await bundleRepo.createBundle(data);
  return formatBundle(bundle, { timezone });
};

const getBundlesService = async ({ page = 1, limit = 10, keyword, status = "active", date, orderSort = "asc", timezone = "UTC" }) => {
  const query = {};

  // Status filter
  query.status = status ? status : { $ne: "deleted" };

  // Date filter (createdAt)
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // Keyword search (name or description)
  if (keyword) {
    query.$or = [
      { name: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } }
    ];
  }

  // Pagination
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Sorting (by createdAt)
  const sort = { createdAt: orderSort === "desc" ? -1 : 1 };

  // Fetch bundles and total count concurrently
  let [bundles, counts] = await Promise.all([
    bundleRepo.getBundles(query, skip, limit === 0 ? 0 : limit, sort),
    bundleRepo.getBundlesCount(query)
  ]);

  // Format bundles
  bundles = bundles.map((bundle) => formatBundle(bundle, { timezone }));
  let { active, inactive, total, totalFiltered } = counts;
  // Meta info
  let meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { active, inactive, total };

  return { bundles, meta };
};


const getBundleByIdService = async (id, timezone) => {
  let bundle = await bundleRepo.getBundleById(id);
  return formatBundle(bundle, { timezone });
};

const updateBundleService = async (id, data, timezone) => {
  let bundle = await bundleRepo.updateBundle(id, data);
  return formatBundle(bundle, { timezone });
};

const deleteBundleService = async (id) => {
  return bundleRepo.findTagByIdAndUpdate(id, { status: "deleted" });
};

module.exports = {
  createBundleService,
  getBundlesService,
  getBundleByIdService,
  updateBundleService,
  deleteBundleService,
};