// services/organizationService.js

const organizationRepo = require("./organizationRepository");

const createOrganization = async ({ data }) => {
  return await organizationRepo.createOrganization(data);
};

const getOrganizations = async ({ page, limit, keyword, status, creator }) => {
  const query = {};
  if (creator) query.creator = creator;
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
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

const getPublicOrganizations = async ({ page, limit, keyword }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
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

const updateOrganization = async (id, data) => {
  const organization = await organizationRepo.findOrganizationById(id);
  if (!organization) return null;

  const {
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    venues,
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
  if (venues !== undefined) organization.venues = venues;
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

module.exports = {
  createOrganization,
  getOrganizations,
  updateOrganization,
  deleteOrganization,
  getPublicOrganizations,
  checkOrganizationExists,
};
