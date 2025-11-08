// repositories/tagRepository.js
const Tags = require("@TagsModel");

// Create
const createTag = async (data) => {
  const tag = new Tags(data);
  return await tag.save();
};

// Get all with filters
const getTagsWithFilters = async (query, skip, limit) => {
  return Tags.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countTags = async (query = {}) => {
  return Tags.countDocuments(query);
};

// Find by ID
const findTagById = async (id) => {
  return Tags.findById(id);
};

// Update and save
const updateTagData = async (tag, data) => {
  Object.assign(tag, data);
  return await tag.save();
};

// Delete
const deleteTagById = async (tag) => {
  return await tag.deleteOne();
};

//findTagByIdAndUpdate
const findTagByIdAndUpdate = async (id, data) => {
  return Tags.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createTag,
  getTagsWithFilters,
  countTags,
  findTagById,
  updateTagData,
  deleteTagById,
  findTagByIdAndUpdate,
};
