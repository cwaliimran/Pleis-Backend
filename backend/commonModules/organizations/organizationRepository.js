// repositories/organizationRepository.js
const Venues = require("../venues/Venues");
const Organizations = require("./Organization");

const { getModelCounts } = require("@dbUtils/queryUtil");

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


const getOrganizationDetails = async (id) => {
  const [organization, primaryVenue] = await Promise.all([
    Organizations.findById(id)
      .populate("otherInfo.tags")
      .populate("otherInfo.categories"),
    Venues.findOne({
      organization: id,
      isPrimary: true
    }).populate("venueType")
  ]);
  if (!organization) return null;

  // Attach primaryVenue (formatted) or null inside organization
  const orgObj = organization.toObject ? organization.toObject() : organization;
  orgObj.venue = primaryVenue ? primaryVenue.formatResponse() : null;
  return orgObj;
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

//get user organizations

module.exports = {
  createOrganization,
  getOrganizationsWithFilters,
  countOrganizations,
  getOrganizationCounts,
  findOrganizationById,
  deleteOrganizationById,
  findByIdAndUpdate,
  getOrganizationDetails,
  getOrganizationsAsStaff
};
