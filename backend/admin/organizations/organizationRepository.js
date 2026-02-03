// repositories/organizationRepository.js
const Venues = require("@VenuesModel");

const Organizations = require("@OrganizationModel");
const Menus = require("@MenusModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const { getPromotionsByCreator } = require("../loyalty/promotions/promotionsRepository");
const { getNotificationByOrganizationId } = require("../notifications/notificationsRepository");

// Create
const createOrganization = async (data) => {
  const organization = new Organizations(data);
  return await organization.save();
};

// Get all with filters
const getOrganizationsWithFilters = async (query, skip, limit) => {
  const results = await Organizations.find(query)
    .populate("creator", "firstName lastName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
  return results;
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
  // Fetch organization and primary venue concurrently
  const [organization, primaryVenue] = await Promise.all([
    Organizations.findById(id)
      .populate("otherInfo.tags")
      .populate("otherInfo.categories")
      .populate({
        path: "creator",
        select: "firstName lastName email companyDetails",
        populate: {
          path: "companyDetails.suppliers",
          select: "title",
        },
      }),
    Venues.findOne({ organization: id, isPrimary: true }).populate("venueType"),
  ]);

  // Return null if no organization is found
  if (!organization) return null;

  // Get creator id directly from populated organization
  const creatorId = organization.creator?._id;

  // Fetch promotions using the creator's id (only if creator exists)
  const promotions = creatorId ? await getPromotionsByCreator(creatorId) : [];

  // Convert organization to plain object if necessary
  const orgObj = organization.toObject ? organization.toObject() : organization;

  // Attach venue and promotions data
  orgObj.venue = primaryVenue ? primaryVenue.formatResponse() : null;
  orgObj.promotions = promotions;

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

const getStaffIdsByOrganization = async (organizationId) => {
  if (!mongoose.Types.ObjectId.isValid(organizationId)) {
    throw new Error("Invalid organization ID");
  }

  const organization = await Organizations.findById(
    organizationId,
    { staff: 1 }
  ).lean();

  if (!organization || !organization.staff) {
    return [];
  }

  // Extract staff user IDs
  const staffIds = organization.staff
    .map(item => item.user)
    .filter(Boolean)
    .map(id => id.toString());

  return staffIds;
};


//get organization ids by company organizer
const getOrganizationIdsByCompanyOrganizer = async (companyOrganizer) => {
  const organizations = await Organizations.find({ creator: companyOrganizer }).select("_id").lean();
  return organizations.map(org => org._id);
};

//get organization names by company organizer
const getOrganizationNamesByCompanyOrganizer = async (companyOrganizer) => {
  const organizations = await Organizations.find({ creator: companyOrganizer }).select("basicInfo.name").lean();
  return organizations;
};

//getMenuIdsByCompanyOrganizer
const getMenuIdsByCompanyOrganizer = async (companyOrganizer) => {
  const organizationIds = await getOrganizationIdsByCompanyOrganizer(companyOrganizer);
  const menus = await Menus.find({ organization: { $in: organizationIds } }).select("_id").lean();
  return menus.map(menu => menu._id);
};
const getOrgCompanyOrganizer = async (organizationId) => {
  const org = await Organizations.findById(organizationId).select("creator").lean();
  return org ? org.creator : null;
}
const getOrganizationNotifications = async (id) => {
  const notifications= await getNotificationByOrganizationId(id);
  return notifications;
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
  getOrganizationsAsStaff,
  getOrganizationIdsByCompanyOrganizer,
  getMenuIdsByCompanyOrganizer,
  getOrganizationNamesByCompanyOrganizer,
  getStaffIdsByOrganization,
  getOrgCompanyOrganizer,
  getOrganizationNotifications
};
