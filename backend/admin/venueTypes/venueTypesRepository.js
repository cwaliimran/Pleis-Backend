// repositories/venueTypeRepository.js

const { getWithFilters, getModelCounts } = require('@dbUtils/queryUtil');

const VenueTypesModel = require("./VenueTypesModel");
const { cache, invalidate } = require("@redisCache");
const { default: mongoose } = require('mongoose');
const ACTIVE_VENUE_TYPES_CACHE_KEY = "venueTypes:active";
const buildVenueTypesCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10,
  status,
  date,
  keyword,
  categoriesFilter = []
}) => {
  return `${ACTIVE_VENUE_TYPES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}:status=${status}:date=${date}:keyword=${keyword}`;
};
// Create
const createVenueType = async (data) => {
  const venuetype = new VenueTypesModel(data);
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return await venuetype.save();
};

// Get all with filters
const getVenueTypesWithFilters = async (query, page, limit, status, date, keyword, categoriesFilter = []) => {
if (categoriesFilter.length > 0) {
  categoriesFilter = categoriesFilter.map(id => new mongoose.Types.ObjectId(id)); // Convert string IDs to ObjectIds
}
await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  const cacheKey = buildVenueTypesCacheKey({
    scope: "admin",
    skip: page,
    limit,
    status,
    date,
    keyword,
    categoriesFilter: categoriesFilter.length > 0 ? categoriesFilter.join(",") : "" 
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      return getWithFilters({
        model: VenueTypesModel,
        query,
        populate: [
          {
            path: "categories",
            select: "title order",
            match: { status: "active" },
          },
          
        ],
        options: { page, limit, sort: { title: 1 } },
      });
      
    },
  });
};

const getCounts = async (query) => {
  return getModelCounts({ model: VenueTypesModel, filterQuery: query });
}

// Count by condition
const countVenueTypes = async (query = {}) => {
  return VenueTypesModel.countDocuments(query);
};

// Find by ID
const findVenueTypeById = async (id) => {
  return VenueTypesModel.findById(id);
};

// Update and save
const updateVenueTypeData = async (venuetype, data) => {
  Object.assign(venuetype, data);
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return await venuetype.save();
};

// Delete
const deleteVenueTypeById = async (venuetype) => {
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return await venuetype.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return VenueTypesModel.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createVenueType,
  getVenueTypesWithFilters,
  countVenueTypes,
  findVenueTypeById,
  updateVenueTypeData,
  deleteVenueTypeById,
  findByIdAndUpdate,
  getCounts,
};
