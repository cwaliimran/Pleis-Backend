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
  limit,
  skip,
  userLocation,
  radiusKm,
}) => {
  const filters = [];

  // Base status filter
  filters.push({ status: { $ne: "deleted" } });

  // Build query
  const query = filters.length ? { $and: filters } : {};

  // Convert category to ObjectId (IMPORTANT)
  let categoryObjectId = null;
  if (category) {
    categoryObjectId = new mongoose.Types.ObjectId(category);
  }

  const topPicksOrganizations =
    await topPicksOrganizationRepo.getTopPicksOrganizationsWithFiltersHomeRepo(
      query,
      skip,
      limit,
      userLocation,
      radiusKm,
      categoryObjectId
    );

  const formattedTopPicksOrganizations = formatTopPicks(topPicksOrganizations);

  return {
    topPicksOrganizations: formattedTopPicksOrganizations,
  };
};


module.exports = {
  getTopPicksOrganizations,
  getTopPicksOrganizationsForHomeService,
};