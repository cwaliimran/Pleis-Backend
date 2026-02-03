// services/organizationService.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const Venues = require("../../commonModules/venues/Venues");
const Organizations = require("@OrganizationModel");
const organizationRepo = require("./organizationRepository");
const { generateMeta } = require("../../helperUtils/responseUtil");

const { formatOrganization, formatNotificationImage } = require("./formatter/formatOrganization");
const { default: mongoose } = require("mongoose");
const { invalidate } = require("@redisCache");
const ACTIVE_ORGANIZATIONS_CACHE_KEY = "organizations:active";
const createOrganization = async ({ data, timezone }) => {
  let org = await organizationRepo.createOrganization(data);
  return formatOrganization(org, [], timezone);
};

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

const getOrganizationsByAdmin = async ({ companyOrganizer, page, limit, keyword, status, date, timezone }) => {
  const query = {};
  if (companyOrganizer) {
    query.creator = new mongoose.Types.ObjectId(companyOrganizer);
  }

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
        limit === 0 ? 0 : limit
      ),
      organizationRepo.getOrganizationCounts(query),
    ]);

  const { totalFiltered, total, active, inactive } = counts;
  let meta = generateMeta(page, limit, totalFiltered);
  meta.tagsCount = { total, active, inactive };
  console.log("organizations", organizations);
  organizations = organizations.map(org => formatOrganization(org, [], timezone));

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

    // ---------- VENUE HANDLING ----------
    if (venue !== undefined) {
      await Venues.updateMany(
        { organization: organization._id, isPrimary: true },
        { isPrimary: false },
        { session }
      );

      const existingVenue = await Venues.findById(venue).session(session);
      if (existingVenue) {
        if (!existingVenue.organization || String(existingVenue.organization) !== String(organization._id)) {
          existingVenue.organization = organization._id;
        }
        existingVenue.isPrimary = true;
        await existingVenue.save({ session });
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
  getOrganizationNamesByCompanyOrganizer
};
