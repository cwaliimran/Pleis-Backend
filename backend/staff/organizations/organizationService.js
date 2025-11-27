

const organizationRepo = require("./organizationRepository");







const getOrganizationsAsStaff = async (id) => {
  return await organizationRepo.getOrganizationsAsStaff(id);
};




module.exports = {

  getOrganizationsAsStaff,

};
