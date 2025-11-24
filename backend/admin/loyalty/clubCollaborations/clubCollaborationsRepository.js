// repositories/clubCollaborationRepository.js
const ClubCollaborations = require("@ClubCollaborationModel");
const mongoose = require("mongoose");

// Create clubCollaboration in a transaction and update organization
const createClubCollaboration = async (data) => {
  try {
    // Create clubCollaboration
    const clubCollaboration = new ClubCollaborations(data);
    return await clubCollaboration.save();
  } catch (err) {
    throw err;
  }
};

// Get all clubCollaborations with their assigned organization populated, sorted by createdAt descending
const getClubCollaborationsWithFilters = async (pipeline) => {
  return ClubCollaborations.aggregate(pipeline);
};

const checkExistingCollaboration = async ({ senderId, receiverId }) => {
  return ClubCollaborations.findOne({
    "sender.id": senderId,
    "receiver.id": receiverId,
    "sender.status": { $ne: "deleted" }
  });
};


// Count by condition
const countClubCollaborations = async (query = {}) => {
  return ClubCollaborations.countDocuments(query);
};

// Find by ID
const findClubCollaborationById = async (id) => {
  return ClubCollaborations.findById(id);
};

// Update and save
const updateClubCollaborationData = async (clubCollaboration, data) => {
  Object.assign(clubCollaboration, data);
  return await clubCollaboration.save();
};

// Delete
const deleteClubCollaborationById = async (clubCollaboration) => {
  return await clubCollaboration.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return ClubCollaborations.findByIdAndUpdate(id, data, { new: true }).populate('sender.id receiver.id');
};

module.exports = {
  createClubCollaboration,
  getClubCollaborationsWithFilters,
  countClubCollaborations,
  findClubCollaborationById,
  updateClubCollaborationData,
  findByIdAndUpdate,
  checkExistingCollaboration
};