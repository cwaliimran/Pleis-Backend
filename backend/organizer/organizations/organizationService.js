// services/organizationService.js
const organizationRepo = require("./organizationRepository");

const createOrganization = async ({ title, description, status }) => {
  return await organizationRepo.createOrganization({ title, description, status });
};

const getOrganizations = async ({ page, limit, keyword, status }) => {
  const query = {};
  if (status) query.status = status;
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [organizations, totalFiltered, total, active, inactive] = await Promise.all([
    organizationRepo.getOrganizationsWithFilters(query, skip, limit === 0 ? 0 : limit),
    organizationRepo.countOrganizations(query),
    organizationRepo.countOrganizations({}),
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
    organizationRepo.getOrganizationsWithFilters(query, skip, limit === 0 ? 0 : limit),
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

  const updated = await organizationRepo.updateOrganizationData(organization, data);
  return updated;
};

const deleteOrganization = async (id) => {
  const organization = await organizationRepo.findOrganizationById(id);
  if (!organization) return null;

  await organizationRepo.deleteOrganizationById(organization);
  return true;
};

module.exports = {
  createOrganization,
  getOrganizations,
  updateOrganization,
  deleteOrganization,
  getPublicOrganizations,
};
