// services/organizationService.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const Venues = require("../../commonModules/venues/Venues");
const Organizations = require("@OrganizationModel");
const organizationRepo = require("./organizationRepository");
const { generateMeta } = require("../../helperUtils/responseUtil");

const { formatOrganization, formatNotificationImage } = require("./formatter/formatOrganization");
const { default: mongoose } = require("mongoose");
const { invalidate } = require("@redisCache");
const { getActiveEventsCountForOrganizations } = require("../events/eventRepository");
const ACTIVE_ORGANIZATIONS_CACHE_KEY = "organizations:active";
const createOrganization = async ({ data, timezone }) => {
  let org = await organizationRepo.createOrganization(data);
  return formatOrganization(org, [], timezone);
};
const getAllOrganizationsAdmin = async ({ timezone }) => {
  return await organizationRepo.getAllOrganizationsAdmin();

}
const getOrganizations = async ({ page, limit, keyword, status, creator, date, timezone }) => {
  const query = {};
  query.$or = [
    { creator: creator },
    { "staff.user": creator },
  ];
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  if (keyword && keyword.trim() !== "") {
    Object.assign(
      query,
      buildKeywordQueryFromModels(Organizations, keyword)
    );
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let [organizations, counts] =
    await Promise.all([
      organizationRepo.getOrganizationsWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      organizationRepo.getOrganizationCounts(query),
    ]);

  const totalFiltered = counts?.totalFiltered || 0;
  const total = counts?.total || 0;
  const active = counts?.active || 0;
  const inactive = counts?.inactive || 0;
  let meta = generateMeta(page, limit, totalFiltered);
  meta.tagsCount = { total, active, inactive };

  organizations = organizations.map(org => formatOrganization(org, [], timezone));

  return {
    organizations,
    meta
  };
};

const getOrganizationsByAdmin = async ({ companyOrganizer, page, limit, keyword, status, date, timezone, sortBy, sortOrder, organization, subType }) => {
  const query = {};
  if (companyOrganizer) {
    query.creator = new mongoose.Types.ObjectId(companyOrganizer);
  }

  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };
  }
  if (organization) {
    query._id = new mongoose.Types.ObjectId(organization);
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  if (keyword && keyword.trim() !== "") {
    Object.assign(
      query,
      buildKeywordQueryFromModels(
        [
          { schema: Organizations.schema }
        ],
        keyword
      )
    );
  }


  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let [organizations, counts] =
    await Promise.all([
      organizationRepo.getOrganizationsWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit,
        sortBy,
        sortOrder,
        subType
      ),
      organizationRepo.getOrganizationCounts(query),
    ]);
  const { totalFiltered, total, active, inactive } = counts;
  let meta = generateMeta(page, limit, totalFiltered);
  meta.tagsCount = { total, active, inactive };
  organizations = organizations.map(org => formatOrganization(org, [], timezone));
  //get active events count of each organization and add to organization object
  const organizationIds = organizations.map(org => org._id);
  const eventsCounts = await getActiveEventsCountForOrganizations(organizationIds);
  const eventsCountMap = new Map(
    eventsCounts.map(e => [
      e._id.toString(),
      e.count
    ])
  );

  organizations = organizations.map(org => ({
    ...org,

    meta: {
      ...(org.meta || {}),
      activeEventsCount:
        eventsCountMap.get(org._id.toString()) || 0,
    },
  }));

  return {
    organizations,
    meta
  };
};

const getPublicOrganizations = async ({ page, limit, keyword, date, timezone }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let [organizations, totalFiltered] = await Promise.all([
    organizationRepo.getOrganizationsWithFilters(
      query,
      skip,
      limit === 0 ? 0 : limit
    ),
    organizationRepo.countOrganizations(query),
  ]);

  organizations = organizations.map(org => formatOrganization(org, [], timezone));

  return {
    organizations,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateOrganization = async ({ id, data, timezone }) => {
  const {
    basicInfo,
    otherInfo,
    operatingHours,
    status,
    venue,
    location,
    pinned,
    image,
    tags,
    description,
    title,
    inAppOrderingSettings,
    companyDetails
  } = data;
  await invalidate(ACTIVE_ORGANIZATIONS_CACHE_KEY);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const organization = await Organizations.findById(id).session(session);
    if (!organization) throw new Error("Organization not found");

    // ---------- ENSURE NESTED OBJECTS EXIST ----------
    if (!organization.basicInfo) organization.basicInfo = {};
    if (!organization.basicInfo.phoneNumber) organization.basicInfo.phoneNumber = { code: '', number: '' };
    if (!organization.basicInfo.socialLinks) organization.basicInfo.socialLinks = { youtube: '', facebook: '', instagram: '', linkedin: '' };
    if (!organization.basicInfo.media) organization.basicInfo.media = { logo: '', cover: '' };

    if (!organization.otherInfo) organization.otherInfo = {};

    // ---------- CLEAN INCOMING DATA (remove undefined values) ----------
    const cleanBasicInfo = basicInfo ? Object.fromEntries(
      Object.entries(basicInfo).filter(([_, v]) => v !== undefined)
    ) : null;

    const cleanOtherInfo = otherInfo ? Object.fromEntries(
      Object.entries(otherInfo).filter(([_, v]) => v !== undefined)
    ) : null;

    const cleanOperatingHours = operatingHours ? Object.fromEntries(
      Object.entries(operatingHours).filter(([_, v]) => v !== undefined)
    ) : null;

    // ---------- UPDATE FIELDS ----------
    if (cleanBasicInfo) {
      // Ensure nested objects exist in incoming data (don't pass undefined)
      if (cleanBasicInfo.phoneNumber === undefined) cleanBasicInfo.phoneNumber = organization.basicInfo.phoneNumber;
      if (cleanBasicInfo.socialLinks === undefined) cleanBasicInfo.socialLinks = organization.basicInfo.socialLinks;
      if (cleanBasicInfo.media === undefined) cleanBasicInfo.media = organization.basicInfo.media;

      organization.basicInfo = deepMergeSafe(organization.basicInfo, cleanBasicInfo);
    }

    if (cleanOtherInfo) {
      organization.otherInfo = deepMergeSafe(organization.otherInfo, cleanOtherInfo);
    }

    if (cleanOperatingHours) {
      if (!organization.operatingHours) organization.operatingHours = {};
      organization.set("operatingHours", cleanOperatingHours);
    }

    if (status !== undefined) organization.status = status;
    if (location !== undefined) organization.location = location;
    if (pinned !== undefined) organization.pinned = pinned;
    if (image !== undefined) organization.image = image;
    if (tags !== undefined) organization.tags = tags;
    if (description !== undefined) organization.otherInfo.description = description;
    if (title !== undefined) organization.basicInfo.name = title;
    if (companyDetails !== undefined) organization.creator = companyDetails.creator;

    // ---------- UPDATE inAppOrderingSettings ----------
    if (inAppOrderingSettings !== undefined) {
      organization.inAppOrderingSettings = {
        paymentMethods: {
          instantPayment:
            inAppOrderingSettings?.paymentMethods?.instantPayment ??
            organization?.inAppOrderingSettings?.paymentMethods?.instantPayment ??
            false,

          payLater: {
            allow:
              inAppOrderingSettings?.paymentMethods?.payLater?.allow ??
              organization?.inAppOrderingSettings?.paymentMethods?.payLater?.allow ??
              false,

            enableOrderAcceptance:
              inAppOrderingSettings?.paymentMethods?.payLater?.enableOrderAcceptance ??
              organization?.inAppOrderingSettings?.paymentMethods?.payLater?.enableOrderAcceptance ??
              false,

            chargeOnAcceptance:
              inAppOrderingSettings?.paymentMethods?.payLater?.chargeOnAcceptance ??
              organization?.inAppOrderingSettings?.paymentMethods?.payLater?.chargeOnAcceptance ??
              false,

            chargeOnDelivery:
              inAppOrderingSettings?.paymentMethods?.payLater?.chargeOnDelivery ??
              organization?.inAppOrderingSettings?.paymentMethods?.payLater?.chargeOnDelivery ??
              false,
          },

          cashPayment:
            inAppOrderingSettings?.paymentMethods?.cashPayment ??
            organization?.inAppOrderingSettings?.paymentMethods?.cashPayment ??
            false,
        },

        deliveryMethods: {
          counterPickup:
            inAppOrderingSettings?.deliveryMethods?.counterPickup ??
            organization?.inAppOrderingSettings?.deliveryMethods?.counterPickup ??
            true,

          tableDelivery:
            inAppOrderingSettings?.deliveryMethods?.tableDelivery ??
            organization?.inAppOrderingSettings?.deliveryMethods?.tableDelivery ??
            false,

          toGo:
            inAppOrderingSettings?.deliveryMethods?.toGo ??
            organization?.inAppOrderingSettings?.deliveryMethods?.toGo ??
            false,
        },
      };
    }



    // ---------- VENUE HANDLING ----------
    if (venue !== undefined) {
      await Venues.updateMany(
        { organization: organization._id, isPrimary: true },
        { isPrimary: false }
      );

      const existingVenue = await Venues.findById(venue);
      if (existingVenue) {
        existingVenue.organization = organization._id;
        existingVenue.isPrimary = true;
        await existingVenue.save();
      }
    }

    // ---------- SAVE ORGANIZATION ----------
    await organization.save({ session });

    await session.commitTransaction();

    // Return formatted organization
    return formatOrganization(organization, [], timezone);

  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};




const deleteOrganization = async (id) => {
  const updated = await organizationRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const checkOrganizationExists = async (id) => {
  const organization = await organizationRepo.findOrganizationById(id);
  return !!organization;
};

const findOrganizationById = async (id) => {
  let org = await organizationRepo.findOrganizationById(id);
  return formatOrganization(org);
};

const getOrganizationDetails = async (id, timezone) => {
  let org = await organizationRepo.getOrganizationDetails(id);
  return formatOrganization(org, [], timezone);
};

const getOrganizationsAsStaff = async (id) => {
  return await organizationRepo.getOrganizationsAsStaff(id);
};

const getOrganizationNamesByCompanyOrganizer = async (companyOrganizer) => {
  return await organizationRepo.getOrganizationNamesByCompanyOrganizer(companyOrganizer);
}

// ---------- DEEP MERGE FUNCTION ----------
const deepMergeSafe = (target = {}, source = {}) => {
  const result = { ...target };
  for (const key in source) {
    const value = source[key];
    if (value === undefined) continue;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMergeSafe(target[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
};
const getOrganizationNotifications = async (id, timezone) => {
  let notifications = await organizationRepo.getOrganizationNotifications(id);
  return formatNotificationImage(notifications, [], timezone);
};

const getOrganizationsByTagService = async ({ tagId, timezone,
  userLocation,
  radiusKm,
  page,
  limit }) => {

  let { organizations } = await organizationRepo.getOrganizationsByTag({
    tagId,
    userLocation,
    radiusKm,
    page,
    limit
  });
  if (organizations) {
    organizations = organizations.map(org => formatOrganization(org, [], timezone));
  }

  return { organizations };
};

const getOrganizationsByVenueTypeService = async ({
  venueTypeId,
  timezone,
  userLocation,
  radiusKm,
  page,
  limit
}) => {
  const result = await organizationRepo.getOrganizationsByVenueType({
    venueTypeId,
    userLocation,
    radiusKm,
    page,
    limit
  });

  const formatted = result.organizations.map(org =>
    formatOrganization(org, [], timezone)
  );

  return {
    organizations: formatted
  };
};

const getOrganizationByCategoryService = async ({ categoryId, timezone, userLocation,
  radiusKm, page, limit }) => {

  let { organizations } = await organizationRepo.getOrganizationByCategory({ categoryId, userLocation, radiusKm, page, limit });
  if (organizations) {
    organizations = organizations.map(org => formatOrganization(org, [], timezone));
  }

  return { organizations };
};

const getOrganizationsBatch = async ({
  orgTags,
  orgCategories,
  orgVenueTypes,
  userLocation,
  radiusKm,
  timezone,
}) => {
  const { organizations } = await organizationRepo.getOrganizationsBatchRepo({
    tagIds: [...orgTags],
    categoryIds: [...orgCategories],
    venueTypeIds: [...orgVenueTypes],
    userLocation,
    radiusKm,
  });

  return organizations.map(o =>
    formatOrganization(o, [], timezone)
  );
};

module.exports = {
  createOrganization,
  getOrganizations,
  getOrganizationsByAdmin,
  updateOrganization,
  findOrganizationById,
  deleteOrganization,
  getPublicOrganizations,
  checkOrganizationExists,
  getOrganizationsAsStaff,
  getOrganizationDetails,
  getOrganizationNotifications,
  getOrganizationNamesByCompanyOrganizer,
  ACTIVE_ORGANIZATIONS_CACHE_KEY,
  getOrganizationsByTagService,
  getOrganizationsByVenueTypeService,
  getOrganizationByCategoryService,
  getOrganizationsBatch,
  getAllOrganizationsAdmin
};
