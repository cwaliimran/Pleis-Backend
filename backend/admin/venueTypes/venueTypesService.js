// services/venuetypeService.js
const { default: mongoose } = require("mongoose");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { formatVenueType } = require("./fomatter/formatVenueType");
const venuetypeRepo = require("./venueTypesRepository");

const createVenueType = async ({ image, title, status, categories }) => {
  return await venuetypeRepo.createVenueType({ image, title, status, categories });
};
const getVenueTypes = async ({ page, limit, keyword, status, date, categories }) => {
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

  // if category filter is available then match categories with category filter
  //sample category filter value is categories=catId1,catId2
  if (categories) {
    andConditions.push({ categories: { $in: categories.split(",").map(id => new mongoose.Types.ObjectId(id)) } });
  }

  let query = andConditions.length > 0 ? { $and: andConditions } : {};
  //attach keyword filter if available
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      // Add more fields here if needed
    ];
  }



  const [venueTypes, counts] =
    await Promise.all([
      venuetypeRepo.getVenueTypesWithFilters(
        query,
        page,
        limit,
        status,
        date,
        keyword
      ),
      venuetypeRepo.getCounts(query),
    ]);

  //format venueTypes
  const formattedVenueTypes = venueTypes.map(item => formatVenueType(item));

  const { totalFiltered, total, active, inactive } = counts;
  let meta = generateMeta(page, limit, totalFiltered);
  meta.venueTypesCount = { total, active, inactive };
  return {
    venueTypes: formattedVenueTypes,
    meta,
  };
};

const getPublicVenueTypes = async ({ page = 1, limit, keyword, date, categories = [] }) => {
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

  if (categories.length > 0) {
    categories = categories.map(id => new mongoose.Types.ObjectId(id));
    baseQuery.categories = { $in: categories };
  }

  const [venueTypes, totalFiltered] =
    await Promise.all([
      page === 1
        ? venuetypeRepo.getVenueTypesWithFilters(baseQuery, page,
          limit)
        : [],

      venuetypeRepo.countVenueTypes(baseQuery),
    ]);

  const formattedVenueTypes = venueTypes.map(item => formatVenueType(item));

  let meta = generateMeta(page, limit, totalFiltered);

  return {
    venueTypes: formattedVenueTypes,
    meta,
  };
};

const updateVenueType = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.categories !== undefined && { categories: data.categories }),
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
