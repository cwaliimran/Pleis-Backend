// services/supplierService.js
const supplierRepo = require("./supplierRepository");

const createSupplier = async ({ title, description, status }) => {
  return await supplierRepo.createSupplier({ title, description, status });
};

const getSuppliers = async ({ page, limit, keyword, status }) => {
  const query = {};
  if (status) query.status = status;
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [suppliers, totalFiltered, total, active, inactive] = await Promise.all([
    supplierRepo.getSuppliersWithFilters(query, skip, limit === 0 ? 0 : limit),
    supplierRepo.countSuppliers(query),
    supplierRepo.countSuppliers({}),
    supplierRepo.countSuppliers({ status: "active" }),
    supplierRepo.countSuppliers({ status: "inactive" }),
  ]);

  return {
    suppliers,
    meta: {
      page,
      limit,
      total: totalFiltered,
      tagsCount: { total, active, inactive },
    },
  };
};

const getPublicSuppliers = async ({ page, limit, keyword }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [suppliers, totalFiltered] = await Promise.all([
    supplierRepo.getSuppliersWithFilters(query, skip, limit === 0 ? 0 : limit),
    supplierRepo.countSuppliers(query),
  ]);

  return {
    suppliers,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateSupplier = async (id, data) => {
  const supplier = await supplierRepo.findSupplierById(id);
  if (!supplier) return null;

  const updated = await supplierRepo.updateSupplierData(supplier, data);
  return updated;
};

const deleteSupplier = async (id) => {
  const supplier = await supplierRepo.findSupplierById(id);
  if (!supplier) return null;

  await supplierRepo.deleteSupplierById(supplier);
  return true;
};

module.exports = {
  createSupplier,
  getSuppliers,
  updateSupplier,
  deleteSupplier,
  getPublicSuppliers,
};
