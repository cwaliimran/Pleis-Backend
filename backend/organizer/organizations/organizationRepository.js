// repositories/organizationRepository.js
const Venues = require("@VenuesModel");
const Organizations = require("@OrganizationModel");

const { getModelCounts } = require("@dbUtils/queryUtil");
const { User } = require("../../models/UserModel");
const mongoose = require("mongoose");

// Create
const createOrganization = async (data) => {
  const organization = new Organizations(data);
  return await organization.save();
};

// Get all with filters
const getOrganizationsWithFilters = async (query, skip, limit) => {
  return Organizations.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countOrganizations = async (query = {}) => {
  return Organizations.countDocuments(query);
};


const getOrganizationCounts = async (query) => {
  return getModelCounts({ model: Organizations, filterQuery: query });
}

// Find by ID
const findOrganizationById = async (id) => {
  return Organizations.findById(id);
};

// Delete
const deleteOrganizationById = async (organization) => {
  return await organization.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Organizations.findByIdAndUpdate(id, { $set: data }, { new: true });
};

const getOrganizationsAsStaff = async (userId) => {
  const organizations = await Organizations.find({
    $or: [
      { creator: userId },
      { "staff.user": userId }
    ]
  }).select("basicInfo staff").lean();

  // For each organization, filter staff to only include the current user
  return organizations.map(org => {
    if (org.creator?.toString() === userId.toString()) {
      // If creator, return all staff
      return org;
    }
    // Otherwise, filter staff to only the current user
    return {
      ...org,
      staff: org.staff.filter(s => s.user.toString() === userId.toString())
    };
  });
};
const countActiveOrganizationsByCreator = async (creatorId) => {
  try {
    const count = await mongoose
      .model('Organizations')
      .countDocuments({
        creator: creatorId,
        status: "active"
      });

    return count;
  } catch (error) {
    console.error('Error counting active organizations:', error);
    throw error;
  }
};
//get user organizations

module.exports = {
  createOrganization,
  getOrganizationsWithFilters,
  countOrganizations,
  getOrganizationCounts,
  findOrganizationById,
  deleteOrganizationById,
  findByIdAndUpdate,
  getOrganizationsAsStaff,
  countActiveOrganizationsByCreator
};
