// services/supplierService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const supplierRepo = require("./supplierRepository");

const createSupplier = async ({ title, description, status }) => {
  return await supplierRepo.createSupplier({ title, description, status });
};

const getSuppliers = async ({ page, limit, keyword, status, date }) => {
  const query = {};
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }

  // if date is available then match createdAt with date current date format is yyyy-mm-dd
  if (date) {
    query.createdAt = {
      $gte: new Date(date),
      $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
    };
  }

  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [suppliers, totalFiltered, total, active, inactive] = await Promise.all([
    supplierRepo.getSuppliersWithFilters(query, skip, limit === 0 ? 0 : limit,keyword, status, date ),
    supplierRepo.countSuppliers(query),
    supplierRepo.countSuppliers({ status: { $ne: "deleted" } }),
    supplierRepo.countSuppliers({ status: "active" }),
    supplierRepo.countSuppliers({ status: "inactive" }),
  ]);

  let meta = generateMeta(page, limit, totalFiltered);
  meta.tagsCount = { total, active, inactive };

  return {
    suppliers,
    meta,
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
  let meta = generateMeta(page, limit, totalFiltered);
  return {
    suppliers,
    meta,
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

  const updated = await supplierRepo.updateSupplierData(supplier, { status: "deleted" });
  if (!updated) return null;
  return true;
};

module.exports = {
  createSupplier,
  getSuppliers,
  updateSupplier,
  deleteSupplier,
  getPublicSuppliers,
};
