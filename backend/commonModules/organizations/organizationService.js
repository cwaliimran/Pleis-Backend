// services/organizationService.js

const { default: mongoose } = require("mongoose");
const { buildKeywordQueryFromModel } = require("../../helperUtils/queryUtil");
const Venues = require("../venues/Venues");
const Organizations = require("./Organization");
const organizationRepo = require("./organizationRepository");

const createOrganization = async ({ data }) => {
  return await organizationRepo.createOrganization(data);
};

const getOrganizations = async ({ page, limit, keyword, status, creator, date }) => {
  const query = {};
  query.$or = [
    { creator: creator },
    { "staff.user": creator },
  ];
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  if (keyword && keyword.trim() !== "") {
    Object.assign(
      query,
      buildKeywordQueryFromModel(Organizations, keyword)
    );
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [organizations, totalFiltered, total, active, inactive] =
    await Promise.all([
      organizationRepo.getOrganizationsWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      organizationRepo.countOrganizations(query),
      organizationRepo.countOrganizations({ status: { $ne: "deleted" } }),
      organizationRepo.countOrganizations({ status: "active" }),
      organizationRepo.countOrganizations({ status: "inactive" }),
    ]);

  return {
    organizations,
    meta: {
      page,
      limit,
      total: totalFiltered,
      tagsCount: { total, active, inactive },
    },
  };
};

const getPublicOrganizations = async ({ page, limit, keyword, date }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [organizations, totalFiltered] = await Promise.all([
    organizationRepo.getOrganizationsWithFilters(
      query,
      skip,
      limit === 0 ? 0 : limit
    ),
    organizationRepo.countOrganizations(query),
  ]);

  return {
    organizations,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateOrganization = async ({ id, data }) => {
  const organization = await organizationRepo.findOrganizationById(id);
  if (!organization) return null;

  const {
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    venue,
    location,
    pinned,
    image,
    tags,
    description,
    title,
  } = data;

  // ✅ Safe assignment logic
  if (basicInfo) {
    organization.basicInfo = {
      ...organization.basicInfo,
      ...basicInfo,
      media: {
        ...organization.basicInfo.media,
        ...(basicInfo.media || {})
      },
      socialLinks: {
        ...organization.basicInfo.socialLinks,
        ...(basicInfo.socialLinks || {})
      }
    };
  }

  if (otherInfo) {
    organization.otherInfo = {
      ...organization.otherInfo,
      ...otherInfo
    };
  }

  if (operatingHours) {
    organization.operatingHours = {
      ...organization.operatingHours,
      ...operatingHours
    };
  }

  if (status !== undefined) organization.status = status;
  if (location !== undefined) organization.location = location;
  if (pinned !== undefined) organization.pinned = pinned;
  if (image !== undefined) organization.image = image;
  if (tags !== undefined) organization.tags = tags;
  if (description !== undefined) {
    if (!organization.otherInfo) organization.otherInfo = {};
    organization.otherInfo.description = description;
  }
  if (title !== undefined) {
    if (!organization.basicInfo) organization.basicInfo = {};
    organization.basicInfo.name = title;
  }

  if (venue !== undefined) {
    // 1. Set all previous venues' isPrimary to false for this organization
    await Venues.updateMany(
      { organization: organization._id, isPrimary: true },
      { isPrimary: false }
    );

    // 2. Make current venue isPrimary true and assign organization if not assigned
    const existingVenue = await Venues.findOne({ _id: venue });

    if (existingVenue) {
      // Assign organization if not already assigned
      if (!existingVenue.organization || String(existingVenue.organization) !== String(organization._id)) {
        existingVenue.organization = organization._id;
      }
      existingVenue.isPrimary = true;
      await existingVenue.save();
    }
  }


  await organization.save();

  return organization;
};


const deleteOrganization = async (id) => {
  const updated = await organizationRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const checkOrganizationExists = async (id) => {
  const organization = await organizationRepo.findOrganizationById(id);
  return !!organization;
};

const findOrganizationById = async (id) => {
  return await organizationRepo.findOrganizationById(id);
};

const getOrganizationDetails = async (id) => {
  return await organizationRepo.getOrganizationDetails(id);
};

const getOrganizationsAsStaff = async (id) => {
  return await organizationRepo.getOrganizationsAsStaff(id);
};




module.exports = {
  createOrganization,
  getOrganizations,
  updateOrganization,
  findOrganizationById,
  deleteOrganization,
  getPublicOrganizations,
  checkOrganizationExists,
  getOrganizationsAsStaff,
  getOrganizationDetails
};
