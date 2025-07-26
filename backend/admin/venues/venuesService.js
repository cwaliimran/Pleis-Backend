// services/venueService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const venueRepo = require("./venuesRepository");

const createVenue = async (data) => {
  return await venueRepo.createVenue(data);
};
const getVenues = async ({ page, limit, keyword, status, pinned }) => {
  const query = {};
  if (status) query.status = status;
  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
  }
  if (pinned !== undefined) {
    query.$or = [
      ...(query.$or || []),
      { pinned: false },
      { pinned: null },
      { pinned: { $exists: false } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [venues, totalFiltered, total, active, inactive, deleted] =
    await Promise.all([
      venueRepo.getVenuesWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      venueRepo.countVenues(query),
      venueRepo.countVenues({}),
      venueRepo.countVenues({ status: "active" }),
      venueRepo.countVenues({ status: "inactive" }),
      venueRepo.countVenues({ status: "deleted" }),
    ]);

  let meta = generateMeta(page, limit, totalFiltered);
  meta.venuesCount = { total, active, inactive, deleted };
  return {
    venues,
    meta,
  };
};
const getPublicVenues = async ({ page, limit, keyword }) => {
  const baseFilters = [{ status: "active" }];

  if (keyword) {
    baseFilters.push({
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
      ],
    });
  }

  const baseQuery = baseFilters.length ? { $and: baseFilters } : {};

  const pinnedQuery = { ...baseQuery, pinned: true };

  const unpinnedConditions = {
    $or: [{ pinned: false }, { pinned: null }, { pinned: { $exists: false } }],
  };
  const unpinnedQuery = {
    $and: [...(baseQuery.$and || []), unpinnedConditions],
  };

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [pinnedVenues, unpinnedVenues, totalFiltered] =
    await Promise.all([
      page === 1
        ? venueRepo.getVenuesWithFilters(pinnedQuery, 0, 0)
        : [],
      venueRepo.getVenuesWithFilters(
        unpinnedQuery,
        skip,
        limit === 0 ? 0 : limit
      ),
      venueRepo.countVenues(baseQuery),
    ]);

  const totalPages =
    limit && totalFiltered != null ? Math.ceil(totalFiltered / limit) : 1;

  const venues = {
    pinned: pinnedVenues,
    unpinned: unpinnedVenues,
  };
  let meta = {
    page,
    limit,
    totalPages,
    total: totalFiltered,
  };
  return {
    venues,
    meta,
  };
};

const updateVenue = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.floorPlan !== undefined && { floorPlan: data.floorPlan }),
    ...(data.venueType !== undefined && { venueType: data.venueType }),
    ...(data.organization !== undefined && { organization: data.organization }),
    ...(data.isPrimary !== undefined && { isPrimary: data.isPrimary }),
    ...(data.location !== undefined && { location: data.location }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.pinned !== undefined && { pinned: data.pinned }),
  };

  if (Object.keys(updateData).length === 0) {
    const venue = await venueRepo.findVenueById(id);
    return venue;
  }

  const updated = await venueRepo.findByIdAndUpdate(id, updateData);
  return updated;
};

const deleteVenue = async (id) => {
  const updated = await venueRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createVenue,
  getVenues,
  updateVenue,
  deleteVenue,
};
