// repositories/eventRepository.js
const { create } = require("lodash");
const { Events } = require("./Event");

// Create
const createEvent = async (data) => {
  const event = new Events(data);
  return await event.save();
};

// Get all with filters
const getEventsWithFilters = async (query, skip, limit) => {
  return Events.find(query)
    .populate("basicInfo.venue", "title location floorPlan")
    .populate("basicInfo.categories", "title image")
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
    .populate("basicInfo.categories", "title image otherInfo")
    .populate("basicInfo.tags", "title otherInfo")
    .populate({
      path: "basicInfo.organization",
      select: "basicInfo otherInfo operatingHours",
      populate: [
        {
          path: "otherInfo.categories",
          select: "title image otherInfo",
        },
        {
          path: "otherInfo.tags",
          select: "title otherInfo",
        },
      ],
    });
};

// Delete
const deleteEventById = async (event) => {
  return await event.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Events.findByIdAndUpdate(id, { $set: data }, { new: true });
};

// Aggregate pipeline
const aggregateEvents = async (pipeline) => {
  return Events.aggregate(pipeline)
    .option({ allowDiskUse: true }) // Optional: helpful for large datasets
    .exec();
};

const updateMany = async (filter, update) => {
  return Events.updateMany(filter, update);
};


module.exports = {
  createEvent,
  getEventsWithFilters,
  countEvents,
  aggregateEvents,
  findEventById,
  deleteEventById,
  findByIdAndUpdate,
  updateMany,
};
