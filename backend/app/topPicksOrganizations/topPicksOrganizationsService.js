// services/topPicksOrganizationService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const { formatTopPicks } = require("./formatters/topPicksFormatter");
const topPicksOrganizationRepo = require("./topPicksOrganizationsRepository");
const mongoose = require("mongoose");



const getTopPicksOrganizations = async ({
  category,
  page,
  limit,
  skip,
  userLocation,
  radiusKm, }) => {
  const filters = [];

  filters.push({ status: { $ne: "deleted" } });

  const query = filters.length ? { $and: filters } : {};

  if (category) {
    const categoryObjectId = new mongoose.Types.ObjectId(category);
    query["otherInfo.categories"] = { $in: [categoryObjectId] };
  }

  let [topPicksOrganizations, total] = await Promise.all([
    topPicksOrganizationRepo.getTopPicksOrganizationsWithFilters(query, skip, limit, userLocation, radiusKm),
    topPicksOrganizationRepo.countTopPicksOrganizations(query),
  ]);

  let formattedTopPicksOrganizations = formatTopPicks(topPicksOrganizations);

  return {
    topPicksOrganizations: formattedTopPicksOrganizations,
    meta: generateMeta(page, limit, total),
  };

};

const getTopPicksOrganizationsForHomeService = async ({
  category,
  userLocation,
  radiusKm,
  timezone,
  page,
  limit,
  skip,
  userId,
  ctx
}) => {

  const filters = [];

  // Base status filter
  filters.push({ status: { $ne: "deleted" } });

  const query = filters.length ? { $and: filters } : {};

  /* =====================================================
     CATEGORY SAFE PARSING
     ===================================================== */

  let categoryObjectIds = [];

  if (category) {
    const categoryArray = Array.isArray(category)
      ? category
      : [category];

    categoryObjectIds = categoryArray
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));
  }

  const result =
    await topPicksOrganizationRepo.getTopPicksOrganizationsWithFiltersHomeRepo(
      query,
      skip,
      limit,
      userLocation,
      radiusKm,
      categoryObjectIds,
      ctx
    );

  return {
    topPicksOrganizations: formatTopPicks(result.topPicksOrganizations),
    totalCount: result.totalCount
  };
};


module.exports = {
  getTopPicksOrganizations,
  getTopPicksOrganizationsForHomeService,
};