// services/usermanagementService.js

const { generateMeta } = require("../../helperUtils/responseUtil");
const usermanagementRepo = require("./usermanagementRepository");

const createUserManagement = async ({ data }) => {
  return await usermanagementRepo.createUserManagement(data);
};

const getUserManagements = async ({ page, limit, keyword, status, creator }) => {
  const query = {};
  if (creator) query.creator = creator;
  if (status) query.status = status;
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [usermanagements, totalFiltered, total, active, inactive, deleted] =
    await Promise.all([
      usermanagementRepo.getUserManagementsWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      usermanagementRepo.countUserManagements(query),
      usermanagementRepo.countUserManagements({}),
      usermanagementRepo.countUserManagements({ status: "active" }),
      usermanagementRepo.countUserManagements({ status: "inactive" }),
      usermanagementRepo.countUserManagements({ status: "deleted" }),
    ]);
  let meta = generateMeta(page, limit, totalFiltered);
  meta.usermanagementsCount = { total, active, inactive, deleted };
  return {
    usermanagements,
    meta
  };
};

const getPublicUserManagements = async ({ page, limit, keyword }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [usermanagements, totalFiltered] = await Promise.all([
    usermanagementRepo.getUserManagementsWithFilters(
      query,
      skip,
      limit === 0 ? 0 : limit
    ),
    usermanagementRepo.countUserManagements(query),
  ]);

  return {
    usermanagements,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateUserManagement = async (id, data) => {
  const usermanagement = await usermanagementRepo.findUserManagementDocById(id);
  if (!usermanagement) return null;
  const {
    title,
    key,
    status,
  } = data;

  if (title !== undefined) {
    usermanagement.title = title;
  }

  if (key !== undefined) {
    usermanagement.key = key;
  }

  if (status !== undefined) {
    usermanagement.status = status;
  }

  await usermanagement.save();

  return usermanagement;
};


const deleteUserManagement = async (id) => {
  const updated = await usermanagementRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const findUserManagementById = async (id) => {
  return await usermanagementRepo.findUserManagementById(id);
};

//find usermanagement by specific query against key in schema e.g status:active
//to use this pass query as : { status: "active" }
const findUserManagementByQuery = async (query) => {
  return await usermanagementRepo.findUserManagementByQuery(query);
};

module.exports = {
  createUserManagement,
  getUserManagements,
  updateUserManagement,
  deleteUserManagement,
  getPublicUserManagements,
  findUserManagementByQuery,
  findUserManagementById,
};
