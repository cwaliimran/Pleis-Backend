const DeliveryOptions = require("@DeliveryOptionsModel");
const { cache, invalidate } = require("@redisCache");
const mongoose = require("mongoose");

const DELIVERY_OPTIONS_CACHE_KEY = "deliveryOptions";

const normalizeOrgId = (organizationId) => {
  if (!organizationId) return "";
  if (typeof organizationId === "object" && organizationId._id) {
    return String(organizationId._id);
  }
  return String(organizationId);
};

const getOrgCacheKey = (organizationId) =>
  `${DELIVERY_OPTIONS_CACHE_KEY}:${normalizeOrgId(organizationId)}`;

const invalidateOrganizationDeliveryOptionsCache = async (organizationId) => {
  const key = getOrgCacheKey(organizationId);
  await invalidate(key);
};

const createDeliveryOption = async (data) => {
  const deliveryOption = new DeliveryOptions(data);
  const saved = await deliveryOption.save();
  // Always invalidate with the persisted org id (same key admin + pickup-options use)
  await invalidateOrganizationDeliveryOptionsCache(
    saved.organization || data.organization,
  );
  return saved;
};

const fetchDeliveryOptionsFromDb = (organizationId) =>
  DeliveryOptions.find({
    organization: new mongoose.Types.ObjectId(normalizeOrgId(organizationId)),
    status: { $ne: "deleted" },
  })
    .sort({ createdAt: -1 })
    .lean();

const getDeliveryOptionsByOrganization = async (organizationId) => {
  // Shared by:
  // - GET /admin|organizer/organizations/:organizationId/delivery-options
  // - GET /app/menu/items/pickup-options/:organization (via getActiveDeliveryOptions)
  return cache({
    namespace: getOrgCacheKey(organizationId),
    params: {},
    ttl: null,
    fetchFn: () => fetchDeliveryOptionsFromDb(organizationId),
  });
};

const getActiveDeliveryOptionsByOrganization = async (organizationId) => {
  const options = await getDeliveryOptionsByOrganization(organizationId);
  return (options || []).filter((option) => option.status === "active");
};

const findDeliveryOptionById = async (id, organizationId = null) => {
  const query = { _id: id, status: { $ne: "deleted" } };
  if (organizationId) {
    query.organization = normalizeOrgId(organizationId);
  }
  return DeliveryOptions.findOne(query);
};

module.exports = {
  createDeliveryOption,
  getDeliveryOptionsByOrganization,
  getActiveDeliveryOptionsByOrganization,
  findDeliveryOptionById,
  invalidateOrganizationDeliveryOptionsCache,
  getOrgCacheKey,
  DELIVERY_OPTIONS_CACHE_KEY,
};
