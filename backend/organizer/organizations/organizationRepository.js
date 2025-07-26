// repositories/organizationRepository.js
const Organization = require("./Organization");

// Create
const createOrganization = async (data) => {
  const organization = new Organization(data);
  return await organization.save();
};

// Get all with filters
const getOrganizationsWithFilters = async (query, skip, limit) => {
  return Organization.find(query)
    .sort({ title: 1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countOrganizations = async (query = {}) => {
  return Organization.countDocuments(query);
};

// Find by ID
const findOrganizationById = async (id) => {
  return Organization.findById(id);
};

// Delete
const deleteOrganizationById = async (organization) => {
  return await organization.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Organization.findByIdAndUpdate(id, { $set: data }, { new: true });
};
module.exports = {
  createOrganization,
  getOrganizationsWithFilters,
  countOrganizations,
  findOrganizationById,
  deleteOrganizationById,
  findByIdAndUpdate,
};
