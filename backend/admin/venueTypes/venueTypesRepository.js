// repositories/venueTypeRepository.js

const { getWithFilters, getModelCounts } = require('@dbUtils/queryUtil');

const VenueTypesModel = require("./VenueTypesModel");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_VENUE_TYPES_CACHE_KEY = "venueTypes:active";
const buildVenueTypesCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_VENUE_TYPES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
// Create
const createVenueType = async (data) => {
  const venuetype = new VenueTypesModel(data);
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return await venuetype.save();
};

// Get all with filters
const getVenueTypesWithFilters = async (query, page, limit) => {
  const cacheKey = buildVenueTypesCacheKey({
    scope: "admin",
    skip: page,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      return getWithFilters({
        model: VenueTypesModel,
        query,
        options: { page, limit },
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
