// services/venuetypeService.js
const venuetypeRepo = require("./venuetypesRepository");

const createVenueType = async ({ image, title, status, pinned }) => {
  return await venuetypeRepo.createVenueType({ image, title, status, pinned });
};
const getVenueTypes = async ({ page, limit, keyword, status, pinned }) => {
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
      { pinned: { $exists: false } }
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [venuetypes, totalFiltered, total, active, inactive, deleted] =
    await Promise.all([
      venuetypeRepo.getVenueTypesWithFilters(query, skip, limit === 0 ? 0 : limit),
      venuetypeRepo.countVenueTypes(query),
      venuetypeRepo.countVenueTypes({}),
      venuetypeRepo.countVenueTypes({ status: "active" }),
      venuetypeRepo.countVenueTypes({ status: "inactive" }),
      venuetypeRepo.countVenueTypes({ status: "deleted" }),
    ]);

  return {
    venuetypes,
    meta: {
      page,
      limit,
      total: totalFiltered,
      venuetypesCount: { total, active, inactive, deleted },
    },
  };
};

const getPublicVenueTypes = async ({ page, limit, keyword }) => {
  const baseQuery = { status: "active" };
  if (keyword) {
    baseQuery.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  // Always get pinned venuetypes first
  const pinnedQuery = { ...baseQuery, pinned: true };
  const unpinnedQuery = {
    ...baseQuery,
    $or: [
      ...(baseQuery.$or || []),
      { pinned: false },
      { pinned: null },
      { pinned: { $exists: false } },
    ],
  };

  // Only skip when keyword is applied
  const skip = keyword ? (limit === 0 ? 0 : (page - 1) * limit) : 0;

  // Get pinned venuetypes (no skip/limit), then unpinned venuetypes (with skip/limit if no keyword)
  const [pinnedVenueTypes, unpinnedVenueTypes, totalFiltered] =
    await Promise.all([
      venuetypeRepo.getVenueTypesWithFilters(pinnedQuery, 0, 0), // all pinned
      venuetypeRepo.getVenueTypesWithFilters(
        unpinnedQuery,
        skip,
        limit === 0 ? 0 : limit
      ), // paginated unpinned
      venuetypeRepo.countVenueTypes(baseQuery),
    ]);

  const venuetypes = {
    pinned: pinnedVenueTypes,
    unpinned: unpinnedVenueTypes,
  };

  return {
    venuetypes,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateVenueType = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.pinned !== undefined && { pinned: data.pinned }),
  };

  if (Object.keys(updateData).length === 0) {
    const venuetype = await venuetypeRepo.findVenueTypeById(id);
    return venuetype;
  }

  const updated = await venuetypeRepo.findByIdAndUpdate(id, updateData);
  return updated;
};

const deleteVenueType = async (id) => {
  const updated = await venuetypeRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createVenueType,
  getVenueTypes,
  updateVenueType,
  deleteVenueType,
  getPublicVenueTypes,
};
