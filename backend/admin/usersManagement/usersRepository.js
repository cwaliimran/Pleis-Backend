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

// Find by ID
const findUserById = async (id) => {
  return User.findById(id);
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

module.exports = {
  createUser,
  getUsersWithFilters,
  countUsers,
  findUserById,
  updateUserData,
  deleteUserById,
  findByIdAndUpdate,
};
