// repositories/organizationRepository.js
const Venues = require("../venues/Venues");
const Organizations = require("./Organization");

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


/**
 * Get filtered and global organization counts efficiently
 * @param {Object} filterQuery - filters applied to organization listing
 * @returns {Object} - { totalFiltered, total, active, inactive }
 */
const getOrganizationCounts = async (filterQuery = {}) => {
  const [filteredCount, globalCounts] = await Promise.all([
    // count only filtered results
    Organizations.countDocuments(filterQuery),

    // aggregate global status counts
    Organizations.aggregate([
      {
        $facet: {
          total: [
            { $match: { status: { $ne: "deleted" } } },
            { $count: "count" },
          ],
          active: [
            { $match: { status: "active" } },
            { $count: "count" },
          ],
          inactive: [
            { $match: { status: "inactive" } },
            { $count: "count" },
          ],
        },
      },
      {
        $project: {
          total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
          active: { $ifNull: [{ $arrayElemAt: ["$active.count", 0] }, 0] },
          inactive: { $ifNull: [{ $arrayElemAt: ["$inactive.count", 0] }, 0] },
        },
      },
    ]),
  ]);

  const counts = globalCounts[0] || {};
  return {
    totalFiltered: filteredCount || 0,
    total: counts.total || 0,
    active: counts.active || 0,
    inactive: counts.inactive || 0,
  };
};


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
