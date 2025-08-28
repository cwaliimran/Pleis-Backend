// services/venuetypeService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const venuetypeRepo = require("./venueTypesRepository");

const createVenueType = async ({ image, title, status, pinned }) => {
  return await venuetypeRepo.createVenueType({ image, title, status, pinned });
};
const getVenueTypes = async ({ page, limit, keyword, status, pinned, date }) => {
  const andConditions = [];
  // if date is available then match createdAt with date current date format is yyyy-mm-dd
  if (date) {
    andConditions.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (status) {
    andConditions.push({ status });
  } else {
    andConditions.push({ status: { $ne: "deleted" } });
  }

  if (keyword) {
    andConditions.push({
      $or: [{ title: { $regex: keyword, $options: "i" } }],
    });
  }

  if (pinned !== undefined) {
    if (pinned === true) {
      andConditions.push({ pinned: true });
    } else {
      andConditions.push({
        $or: [
          { pinned: false },
          { pinned: null },
          { pinned: { $exists: false } },
        ],
      });
    }
  }

  const query = andConditions.length > 0 ? { $and: andConditions } : {};

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [venuetypes, totalFiltered, total, active, inactive] =
    await Promise.all([
      venuetypeRepo.getVenueTypesWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      venuetypeRepo.countVenueTypes(query),
      venuetypeRepo.countVenueTypes({ status: { $ne: "deleted" } }),
      venuetypeRepo.countVenueTypes({ status: "active" }),
      venuetypeRepo.countVenueTypes({ status: "inactive" }),
    ]);
  let meta = generateMeta(page, limit, totalFiltered);
  meta.venueTypesCount = { total, active, inactive };
  return {
    venuetypes,
    meta,
  };
};

const getPublicVenueTypes = async ({ page, limit, keyword, date }) => {
  const baseFilters = [{ status: "active" }];
  //if date is available then match createdAt with date current date format is yyyy-mm-dd
  if (date) {
    baseFilters.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (keyword) {
    baseFilters.push({
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        // Add more fields here if needed
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

  const [pinnedVenueTypes, unpinnedVenueTypes, totalFiltered] =
    await Promise.all([
      page === 1
        ? venuetypeRepo.getVenueTypesWithFilters(pinnedQuery, 0, 0)
        : [],
      venuetypeRepo.getVenueTypesWithFilters(
        unpinnedQuery,
        skip,
        limit === 0 ? 0 : limit
      ),
      venuetypeRepo.countVenueTypes(baseQuery),
    ]);


  const venuetypes = {
    pinned: pinnedVenueTypes,
    unpinned: unpinnedVenueTypes,
  };
  let meta = generateMeta(page, limit, totalFiltered);

  return {
    venuetypes,
    meta,
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
