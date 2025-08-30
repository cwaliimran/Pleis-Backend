// repositories/userRepository.js

const { User } = require("../../models/UserModel");

// Create
const createUser = async (data) => {
  const user = new Users(data);
  return await user.save();
};

// Get all with filters
const getUsersWithFilters = async (query, skip, limit) => {
  return User.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countUsers = async (query = {}) => {
  return User.countDocuments(query);
};

// Find by ID with optional projection
const findUserById = async (id, projection = null) => {
  return User.findById(id, projection);
};

// Update and save
const updateUserData = async (user, data) => {
  Object.assign(user, data);
  return await user.save();
};

// Delete
const deleteUserById = async (user) => {
  return await user.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return User.findByIdAndUpdate(id, data, { new: true });
};

/**
 * Update user's 2FA secret and status
 */
const updateTwoFA = async (userId, data) => {
  return User.findByIdAndUpdate(userId, data, { new: true });
};


module.exports = {
  createUser,
  getUsersWithFilters,
  countUsers,
  findUserById,
  updateUserData,
  deleteUserById,
  findByIdAndUpdate,
  updateTwoFA,
  
};
