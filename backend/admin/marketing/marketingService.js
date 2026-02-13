const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const MarketingRepo = require("./marketingRepository");
const { generateMeta } = require("@utils/responseUtil");
const 
Marketing
= require("@Marketing");

const createMarketing = async (data) => {
  let Marketing = await MarketingRepo.createMarketing(data);
  return Marketing;
};

const getMarketings = async ({ page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object
  const query = {

  };
  if (status) query.status = status;
  else query.status = { $ne: "deleted" };
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }
  if (keyword) {
    Object.assign(query, buildKeywordQueryFromModels([{ schema: Marketing.schema }], keyword));
  }

  // Get Marketings with population
  const Marketings = await MarketingRepo.getMarketingsWithFilters(query, skip, limit);

  // Get counts
  const [total, active, inactive, totalFiltered] = await Promise.all([
    Marketing.countDocuments({ status: { $ne: "deleted" } }),
    Marketing.countDocuments({ status: "active" }),
    Marketing.countDocuments({ status: "inactive" }),
    Marketing.countDocuments(query),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.MarketingsCount = { total, active, inactive };
  // const formattedMarketings = Marketings.map(Marketing => formatMarketing(Marketing, timezone));

  return { Marketings: Marketings, meta };
};

const updateMarketing = async (id, data) => {
  const Marketing = await MarketingRepo.findMarketingById(id);
  if (!Marketing) return null;
  Object.assign(Marketing, data);
  await Marketing.save();

  return Marketing;
};

const deleteMarketing = async (id) => {
  const updated = await MarketingRepo.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};

const getMarketingDetails = async (id) => {
  return await MarketingRepo.findMarketingById(id);
};

const getUserMarketings = async ({ userId, page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object with userId and other filters
  const query = {
    userId: userId,  // Ensure only marketing campaigns for the given userId are fetched
  };

  // Apply status filter
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };  // Default to fetching non-deleted marketing campaigns
  }

  // Apply date filter if provided
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };  // Filter by creation date
  }

  // Apply keyword filter (e.g., search within marketing description)
  if (keyword) {
    const keywordQuery = buildKeywordQueryFromModels([{ schema: Marketing.schema }], keyword);
    Object.assign(query, keywordQuery);  // Add keyword filter to the query object
  }

  try {
    // Get Marketing campaigns with filters, pagination
    const Marketings = await MarketingRepo.getMarketingsWithFilters(query, skip, limit);

    // Get counts for different status types and the total filtered count
    const [total, active, inactive, totalFiltered] = await Promise.all([
      Marketing.countDocuments({ ...query, status: { $ne: "deleted" } }),
      Marketing.countDocuments({ ...query, status: "active" }),
      Marketing.countDocuments({ ...query, status: "inactive" }),
      Marketing.countDocuments(query),
    ]);

    // Generate meta information for pagination
    const meta = generateMeta(page, limit, totalFiltered);
    meta.MarketingCount = { total, active, inactive };  // Add counts for total, active, and inactive

    // // Format Marketing data with timezone adjustment
    // const formattedMarketings = Marketings.map(Marketing => formatMarketing(Marketing, timezone));

    return { Marketings: Marketings, meta };

  } catch (error) {

    throw new Error("Failed to fetch marketing campaigns");
  }
};


module.exports = {
  createMarketing,
  getMarketings,
  updateMarketing,
  getMarketingDetails,
  deleteMarketing,
  getUserMarketings,
};
