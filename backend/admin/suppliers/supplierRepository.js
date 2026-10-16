// repositories/supplierRepository.js
const Supplier = require("@SuppliersModel");
const { cache, invalidate } = require("@redisCache");
const { isPlainListCacheable } = require("@cachePolicy");
const ACTIVE_SUPPLIERS_CACHE_KEY = "suppliers:active";
const buildSuppliersCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10,
  keyword = "",
  status = "",
  date = "",
  sortBy = "createdAt",
  sortOrder = "desc",
}) => {
  return `${ACTIVE_SUPPLIERS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}:keyword=${keyword}:status=${status}:date=${date}:sortBy=${sortBy}:sortOrder=${sortOrder}`;
};
 
// Create
const createSupplier = async (data) => {
  const supplier = new Supplier(data);
  await invalidate(ACTIVE_SUPPLIERS_CACHE_KEY); // Invalidate cache on create
  return await supplier.save();
};

// Get all with filters
const getSuppliersWithFilters = async (query, skip, limit, keyword, status, date, sortBy="createdAt", sortOrder="desc") => {
  const fetchFn = async () => {
    return Supplier.find(query)
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(limit);
  };

  // Only plain pagination (+ status); keyword/date/custom sort bypass Redis.
  if (!isPlainListCacheable({ keyword, date, sortBy: sortBy !== "createdAt" ? sortBy : "", sortOrder: sortOrder !== "desc" ? sortOrder : "" })) {
    return fetchFn();
  }

  const cacheKey = buildSuppliersCacheKey({
    scope: "admin",
    skip,
    limit,
    keyword: "",
    status: status || "",
    date: "",
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400,
    fetchFn,
  });
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
  await invalidate(ACTIVE_SUPPLIERS_CACHE_KEY); // Invalidate cache on update
  return await supplier.save();
};

// Delete
const deleteSupplierById = async (supplier) => {
  await invalidate(ACTIVE_SUPPLIERS_CACHE_KEY); // Invalidate cache on delete
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
