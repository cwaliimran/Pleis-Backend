const { generateMeta } = require("../../helperUtils/responseUtil");
const bundleRepo = require("./bundleRepository");
const { formatBundle } = require("./formatters/bundleFormatter");

const createBundleService = async (data, timezone) => {
  let bundle = await bundleRepo.createBundle(data);
  return formatBundle(bundle, { timezone });
};

const getBundlesService = async ({
  organization,
  page = 1,
  limit = 10,
  keyword,
  status = "active",
  date,
  orderSort = "asc",
  timezone = "UTC"
}) => {
  const query = {};

  // 🔹 Status filter
  query.status = status ? status : { $ne: "deleted" };

  // 🔹 Organization filter (comma or % separated)
  if (organization) {
    const organizationIds = organization
      .split(/[,%]/) // supports "," and "%"
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));

    if (organizationIds.length) {
      query.organization = { $in: organizationIds };
    }
  }

  // 🔹 Date filter
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  // 🔹 Keyword search
  if (keyword) {
    const regex = new RegExp(keyword, "i");

    query.$or = [
      { name: { $regex: regex } },
      { description: { $regex: regex } },

      {
        $expr: {
          $regexMatch: {
            input: { $toString: "$originalPrice" },
            regex: keyword,
            options: "i"
          }
        }
      },
      {
        $expr: {
          $regexMatch: {
            input: { $toString: "$discountedPrice" },
            regex: keyword,
            options: "i"
          }
        }
      },
      {
        $expr: {
          $regexMatch: {
            input: { $toString: "$discountPercentage" },
            regex: keyword,
            options: "i"
          }
        }
      }
    ];
  }

  // 🔹 Pagination
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // 🔹 Sorting
  const sort = { createdAt: orderSort === "desc" ? -1 : 1 };

  // 🔹 Fetch data
  let [bundles, counts] = await Promise.all([
    bundleRepo.getBundles(query, skip, limit === 0 ? 0 : limit, sort),
    bundleRepo.getBundlesCount(query)
  ]);

  // 🔹 Format response
  bundles = bundles.map(bundle => formatBundle(bundle, { timezone }));

  const { active, inactive, total, totalFiltered } = counts;

  const meta = generateMeta(page, limit, totalFiltered);
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