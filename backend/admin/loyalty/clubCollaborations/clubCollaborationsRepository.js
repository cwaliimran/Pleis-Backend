// repositories/clubCollaborationRepository.js
const ClubCollaborations = require("@ClubCollaborationModel");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_LOYALTY_CLUB_COLLABORATION_CACHE_KEY = "loyaltyClubCollaboration:active";
const buildLoyaltyClubCollaborationCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_LOYALTY_CLUB_COLLABORATION_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
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
const getClubCollaborationsWithFilters = async (pipeline, skip, limit) => {
  const cacheKey = buildLoyaltyClubCollaborationCacheKey({
    scope: "admin",
    skip,
    limit,
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      return ClubCollaborations.aggregate(pipeline);
    },
  });
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
  await invalidate(ACTIVE_LOYALTY_CLUB_COLLABORATION_CACHE_KEY); // Invalidate cache
  return await clubCollaboration.save();
};

// Delete
const deleteClubCollaborationById = async (clubCollaboration) => {
  await invalidate(ACTIVE_LOYALTY_CLUB_COLLABORATION_CACHE_KEY); // Invalidate cache
  return await clubCollaboration.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_LOYALTY_CLUB_COLLABORATION_CACHE_KEY); // Invalidate cache
  return ClubCollaborations.findByIdAndUpdate(id, data, { new: true }).populate('sender.id receiver.id');
};
const findByIdAndDelete = async (id) => {
  await invalidate(ACTIVE_LOYALTY_CLUB_COLLABORATION_CACHE_KEY); // Invalidate cache
  return ClubCollaborations.findByIdAndDelete(id);
};


module.exports = {
  createClubCollaboration,
  getClubCollaborationsWithFilters,
  countClubCollaborations,
  findClubCollaborationById,
  updateClubCollaborationData,
  findByIdAndUpdate,
  checkExistingCollaboration,
  findByIdAndDelete
};