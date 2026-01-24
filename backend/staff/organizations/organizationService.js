const organizationRepo = require("./organizationRepository");

const getOrganizationsAsStaff = async (id) => {
  return await organizationRepo.getOrganizationsAsStaff(id);
};

const checkInToOrganization = async (
  organizationId,
  staffId,
  source,
  timezone
) => {
  return organizationRepo.checkInToOrganization({
    organizationId,
    staffId,
    source,
    timezone
  });
};

const checkOutFromOrganization = async (
  organizationId,
  staffId,
  timezone
) => {
  return organizationRepo.checkOutFromOrganization({
    organizationId,
    staffId,
    timezone
  });
};

module.exports = {
  checkInToOrganization,
  checkOutFromOrganization,
  getOrganizationsAsStaff,

};
