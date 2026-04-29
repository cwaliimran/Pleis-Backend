// repositories/supplierRepository.js
const Supplier = require("@SuppliersModel");


// Create
const createSupplier = async (data) => {
  const supplier = new Supplier(data);
  return await supplier.save();
};

// Get all with filters
const getSuppliersWithFilters = async (query, skip, limit) => {
  return Supplier.find(query)
    .sort({ title: 1 })
    .skip(skip)
    .limit(limit);
};

// Count by condition
const countSuppliers = async (query = {}) => {
  return Supplier.countDocuments(query);
};

// Find by ID
const findSupplierById = async (id) => {
  return Supplier.findById(id);
};

// Update and save
const updateSupplierData = async (supplier, data) => {
  Object.assign(supplier, data);
  return await supplier.save();
};

// Delete
const deleteSupplierById = async (supplier) => {
  return await supplier.deleteOne();
};

module.exports = {
  createSupplier,
  getSuppliersWithFilters,
  countSuppliers,
  findSupplierById,
  updateSupplierData,
  deleteSupplierById,
};
