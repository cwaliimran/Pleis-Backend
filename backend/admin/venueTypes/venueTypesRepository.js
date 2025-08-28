// repositories/venueTypeRepository.js

const VenueTypesModel = require("./VenueTypesModel");

// Create
const createVenueType = async (data) => {
  const venuetype = new VenueTypesModel(data);
  return await venuetype.save();
};

// Get all with filters
const getVenueTypesWithFilters = async (query, skip, limit) => {
  return VenueTypesModel.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

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
  return await venuetype.save();
};

// Delete
const deleteVenueTypeById = async (venuetype) => {
  return await venuetype.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
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
};
