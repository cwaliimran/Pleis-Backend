// repositories/venuetypeRepository.js
const VenueTypes = require("./VenueTypes");

// Create
const createVenueType = async (data) => {
  const venuetype = new VenueTypes(data);
  return await venuetype.save();
};

// Get all with filters
const getVenueTypesWithFilters = async (query, skip, limit) => {
  return VenueTypes.find(query)
    .sort({ title: 1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countVenueTypes = async (query = {}) => {
  return VenueTypes.countDocuments(query);
};

// Find by ID
const findVenueTypeById = async (id) => {
  return VenueTypes.findById(id);
};

// Update and save
const updateVenueTypeData = async (venuetype, data) => {
  Object.assign(venuetype, data);
  return await venuetype.save();
};

// Delete
const deleteVenueTypeById = async (venuetype) => {
  return await venuetype.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return VenueTypes.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createVenueType,
  getVenueTypesWithFilters,
  countVenueTypes,
  findVenueTypeById,
  updateVenueTypeData,
  deleteVenueTypeById,
  findByIdAndUpdate,
};
