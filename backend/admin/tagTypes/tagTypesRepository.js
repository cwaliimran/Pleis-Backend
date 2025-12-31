// repositories/TagsTypeRepository.js

const { getWithFilters, getModelCounts } = require('@dbUtils/queryUtil');

const TagTypesModel = require("./TagTypesModel");

// Create
const createTagsType = async (data) => {
  const Tagstype = new TagTypesModel(data);
  return await Tagstype.save();
};

// Get all with filters
const getTagsTypesWithFilters = async (query, page, limit) => {
   return getWithFilters({
    model: TagTypesModel,
    query,
    options: { page, limit },
  });
};

const getCounts = async (query) => {
  return getModelCounts({ model: TagTypesModel, filterQuery: query });
}

// Count by condition
const countTagsTypes = async (query = {}) => {
  return TagTypesModel.countDocuments(query);
};

// Find by ID
const findTagsTypeById = async (id) => {
  return TagTypesModel.findById(id);
};

// Update and save
const updateTagsTypeData = async (Tagstype, data) => {
  Object.assign(Tagstype, data);
  return await Tagstype.save();
};

// Delete
const deleteTagsTypeById = async (Tagstype) => {
  return await Tagstype.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return TagTypesModel.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createTagsType,
  getTagsTypesWithFilters,
  countTagsTypes,
  findTagsTypeById,
  updateTagsTypeData,
  deleteTagsTypeById,
  findByIdAndUpdate,
  getCounts,
};
