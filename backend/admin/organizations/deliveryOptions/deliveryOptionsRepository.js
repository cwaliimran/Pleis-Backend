const DeliveryOptions = require("@DeliveryOptionsModel");
const { cache, invalidate } = require("@redisCache");
const mongoose = require("mongoose");

const DELIVERY_OPTIONS_CACHE_KEY = "deliveryOptions";

const getOrgCacheKey = (organizationId) =>
  `${DELIVERY_OPTIONS_CACHE_KEY}:${String(organizationId)}`;

const invalidateOrganizationDeliveryOptionsCache = async (organizationId) => {
  await invalidate(getOrgCacheKey(organizationId));
};

const createDeliveryOption = async (data) => {
  const deliveryOption = new DeliveryOptions(data);
  const saved = await deliveryOption.save();
  await invalidateOrganizationDeliveryOptionsCache(data.organization);
  return saved;
};

const fetchDeliveryOptionsFromDb = (organizationId) =>
  DeliveryOptions.find({
    organization: new mongoose.Types.ObjectId(organizationId),
    status: { $ne: "deleted" },
  })
    .sort({ createdAt: -1 })
    .lean();

const getDeliveryOptionsByOrganization = async (organizationId) => {
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
    query.organization = organizationId;
  }
  return DeliveryOptions.findOne(query);
};

module.exports = {
  createDeliveryOption,
  getDeliveryOptionsByOrganization,
  getActiveDeliveryOptionsByOrganization,
  findDeliveryOptionById,
  invalidateOrganizationDeliveryOptionsCache,
  DELIVERY_OPTIONS_CACHE_KEY,
};
