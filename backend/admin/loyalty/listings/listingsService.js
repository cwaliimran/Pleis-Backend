const { generateMeta } = require("../../../helperUtils/responseUtil");
const formatLoyaltyListing = require("./formatter/formatLoyaltyListing");
const { getOrganizerUsersWithFilters } = require("./listingsRepository");


/**
 * Get paginated organizer user listings
 */
const getListings = async ({ page = 1, limit = 10, keyword }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Get filtered users
  let { listings, totalFiltered } = await getOrganizerUsersWithFilters({
    skip,
    limit,
    keyword,
  });

  // Format listings
  listings = listings.map(listing => formatLoyaltyListing(listing));

  // Meta
  const meta = generateMeta(page, limit, totalFiltered);

  return { listings, meta };
};



module.exports = {
  getListings,
};
