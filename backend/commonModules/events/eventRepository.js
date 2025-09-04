// repositories/eventRepository.js
const { create } = require("lodash");
const {Events} = require("./Event");

// Create
const createEvent = async (data) => {
  const event = new Events(data);
  return await event.save();
};

// Get all with filters
const getEventsWithFilters = async (query, skip, limit) => {
  return Events.find(query)
  .populate("basicInfo.venue", "title location floorPlan")
  .populate("basicInfo.category", "title image")
  .populate("basicInfo.tags", "title")
  .populate("basicInfo.organization", "basicInfo.name basicInfo.media otherInfo.description")
  .sort({ createdAt: -1 })
  .skip(skip)
  .limit(limit);
};

// Count by condition
const countEvents = async (query = {}) => {
  return Events.countDocuments(query);
};

// Find by ID
const findEventById = async (id) => {
  return Events.findById(id)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.category", "title image")
    .populate("basicInfo.tags", "title")
    .populate("basicInfo.organization", "basicInfo.name basicInfo.media otherInfo.description");
};

// Delete
const deleteEventById = async (event) => {
  return await event.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Events.findByIdAndUpdate(id, { $set: data }, { new: true });
};
module.exports = {
  createEvent,
  getEventsWithFilters,
  countEvents,
  findEventById,
  deleteEventById,
  findByIdAndUpdate,
};
