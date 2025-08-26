// services/userService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const userRepo = require("./usersRepository");

const createUser = async ({ image, title, status, userType }) => {
  return await userRepo.createUser({ image, title, status, userType });
};
const getUsers = async ({ page, limit, keyword, status, userType }) => {
  const query = {
    "verificationStatus.email": "verified",
  };
  if (status) query["accountState.status"] = status;
  if (keyword) {
    query.$or = [{ firstName: { $regex: keyword, $options: "i" } }];
  }
  if (userType !== undefined) {
    query["accountState.userType"] = userType;
  }

  const skip = (page - 1) * limit;
  const [users, totalFiltered, pending, active, rejected, suspended, softDeleted, hardDeleted] =
    await Promise.all([
      userRepo.getUsersWithFilters(
        query,
        skip,
        limit
      ),
      userRepo.countUsers(query),
      userRepo.countUsers({ "accountState.status": "pending" }),
      userRepo.countUsers({ "accountState.status": "active" }),
      userRepo.countUsers({ "accountState.status": "rejected" }),
      userRepo.countUsers({ "accountState.status": "suspended" }),
      userRepo.countUsers({ "accountState.status": "softDeleted" }),
      userRepo.countUsers({ "accountState.status": "hardDeleted" }),
    ]);

  let meta = generateMeta(page, limit, totalFiltered);
  meta.usersCount = { pending, active, rejected, suspended, softDeleted, hardDeleted };
  return {
    users,
    meta,
  };
};

const updateUser = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.image !== undefined && { image: data.image }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.pinned !== undefined && { pinned: data.pinned }),
  };

  if (Object.keys(updateData).length === 0) {
    const user = await userRepo.findUserById(id);
    return user;
  }

  const updated = await userRepo.findByIdAndUpdate(id, updateData);
  return updated;
};

const deleteUser = async (id) => {
  const updated = await userRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
};
