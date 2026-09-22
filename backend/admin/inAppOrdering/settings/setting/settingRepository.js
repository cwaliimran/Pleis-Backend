const Setttings = require("./Setting");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");
const { cache, invalidate } = require("@redisCache");
const Organizations = require("@OrganizationModel");
const {
  mapSettingToOrgPaymentMethods,
} = require("../../../../shared/organizations/orderingPaymentSettingsMap");

const IN_APP_ORDERING_SETTINGS_CACHE_KEY = "inAppOrderingSettings";
const ORGANIZATION_PICKUP_SETTINGS_CACHE_KEY = "organizationPickupSettings";

const normalizeOrgId = (organizationId) => {
  if (!organizationId) return "";
  if (typeof organizationId === "object" && organizationId._id) {
    return String(organizationId._id);
  }
  return String(organizationId);
};

const getOrgCacheKey = (organizationId) =>
  `${IN_APP_ORDERING_SETTINGS_CACHE_KEY}:${normalizeOrgId(organizationId)}`;

const invalidateOrganizationSettingsCache = async (organizationId) => {
  if (!organizationId) return;
  await invalidate(getOrgCacheKey(organizationId));
};

const invalidatePickupSettingsCache = async (organizationId) => {
  if (!organizationId) return;
  await invalidate(
    `${ORGANIZATION_PICKUP_SETTINGS_CACHE_KEY}:${normalizeOrgId(organizationId)}`,
  );
};

/**
 * Keep Organization.inAppOrderingSettings.paymentMethods aligned with Setting.
 */
const syncOrganizationPaymentMethodsFromSetting = async (
  organizationId,
  settingDoc,
) => {
  const orgId = normalizeOrgId(organizationId);
  if (!orgId || !settingDoc) return;

  const org = await Organizations.findById(orgId)
    .select("inAppOrderingSettings")
    .lean();
  if (!org) return;

  const existing = org.inAppOrderingSettings?.paymentMethods || {};
  const paymentMethods = mapSettingToOrgPaymentMethods(settingDoc, existing);

  await Organizations.updateOne(
    { _id: new mongoose.Types.ObjectId(orgId) },
    {
      $set: {
        "inAppOrderingSettings.paymentMethods": paymentMethods,
      },
    },
  );

  await invalidatePickupSettingsCache(orgId);
};

const fetchSettingsFromDb = async (organization) => {
  const SetttingsData = await Setttings.findOne({
    organization: new mongoose.Types.ObjectId(normalizeOrgId(organization)),
  }).lean();

  return SetttingsData || {};
};

const getSetttings = async ({ organization }) => {
  if (!organization) return {};

  return cache({
    namespace: getOrgCacheKey(organization),
    params: {},
    ttl: null, // rarely changes — invalidate on write
    memoryTtl: 300, // L1 warm path for placeOrder / menu reads
    fetchFn: () => fetchSettingsFromDb(organization),
  });
};

const getSetttingsSummary = async ({
  timezone,
  page,
  limit,
  user,
  skip,
}) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $project: {
      _id: 1,
      name: 1,
      code: 1,
    },
  });

  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Setttings.aggregate(pipeline);

  let SetttingsRows = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const [total, active, inactive] = await Promise.all([
    Setttings.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    Setttings.countDocuments({
      status: "active",
      ...(user && { user: user }),
    }),
    Setttings.countDocuments({
      status: "inactive",
      ...(user && { user: user }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.SetttingsCount = { total, active, inactive };

  return { Setttings: SetttingsRows, meta };
};

const findSetttingsById = async (organization) => {
  return Setttings.findOne({
    organization: new mongoose.Types.ObjectId(normalizeOrgId(organization)),
  });
};

const findByIdAndUpdate = async (id, data) => {
  const updated = await Setttings.findByIdAndUpdate(id, data, { new: true });
  if (updated?.organization) {
    await invalidateOrganizationSettingsCache(updated.organization);
    await syncOrganizationPaymentMethodsFromSetting(
      updated.organization,
      updated.toObject ? updated.toObject() : updated,
    );
  }
  return updated;
};

const createSetttings = async (data) => {
  const newSetttings = new Setttings(data);
  await newSetttings.save();
  const orgId = newSetttings.organization || data.organization;
  await invalidateOrganizationSettingsCache(orgId);
  await syncOrganizationPaymentMethodsFromSetting(
    orgId,
    newSetttings.toObject ? newSetttings.toObject() : newSetttings,
  );
  return newSetttings;
};

/**
 * When org APIs write paymentMethods, mirror into Setting (placeOrder source of truth).
 */
const syncSettingFromOrganizationPaymentMethods = async (
  organizationId,
  paymentMethods,
  companyOrganizer,
) => {
  const orgId = normalizeOrgId(organizationId);
  if (!orgId || !paymentMethods) return null;

  const {
    mapOrgPaymentMethodsToSetting,
  } = require("../../../../shared/organizations/orderingPaymentSettingsMap");

  let existing = await findSetttingsById(orgId);
  const mapped = mapOrgPaymentMethodsToSetting(
    paymentMethods,
    existing?.toObject ? existing.toObject() : existing || {},
  );

  if (!existing) {
    if (!companyOrganizer) {
      const org = await Organizations.findById(orgId).select("creator").lean();
      companyOrganizer = org?.creator;
    }
    if (!companyOrganizer) return null;

    existing = await createSetttings({
      organization: orgId,
      companyOrganizer,
      ...mapped,
    });
    return existing;
  }

  existing.paymentMethod = mapped.paymentMethod;
  existing.automaticOrderAcceptance = mapped.automaticOrderAcceptance;
  await existing.save();
  await invalidateOrganizationSettingsCache(orgId);
  // Org already has the paymentMethods the caller wrote — only refresh caches
  await invalidatePickupSettingsCache(orgId);
  return existing;
};

module.exports = {
  getSetttings,
  findSetttingsById,
  findByIdAndUpdate,
  getSetttingsSummary,
  createSetttings,
  invalidateOrganizationSettingsCache,
  syncOrganizationPaymentMethodsFromSetting,
  syncSettingFromOrganizationPaymentMethods,
};
