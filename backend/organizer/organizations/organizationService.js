// services/organizationService.js
const { buildKeywordQueryFromModel } = require("../../helperUtils/dbUtils/queryUtil");
const Venues = require("@VenuesModel");
const Organizations = require("@OrganizationModel");
const organizationRepo = require("./organizationRepository");
const { generateMeta } = require("../../helperUtils/responseUtil");
const mongoose = require("mongoose");
const { formatOrganization } = require("./formatter/formatOrganization");

const createOrganization = async ({ data }) => {
  let org = await organizationRepo.createOrganization(data);
  return formatOrganization(org);
};

const getOrganizations = async ({ page, limit, keyword, status, creator, date }) => {
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
      buildKeywordQueryFromModel(Organizations, keyword)
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

  organizations = organizations.map(org => formatOrganization(org));

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
      buildKeywordQueryFromModel(Organizations, keyword)
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

  organizations = organizations.map(org => formatOrganization(org, []));

  return {
    organizations,
    meta
  };
};

const getPublicOrganizations = async ({ page, limit, keyword, date }) => {
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

  organizations = organizations.map(org => formatOrganization(org));

  return {
    organizations,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};
const updateUserSubscription = async ({
  user,
  subscriptionTypes,
  pricingPlan,
  numberOfOrganizations,
  totalSubscriptionAmount,
}) => {
  if (!user.subscription) {
    user.subscription = {};
  }

  // subscriptionTypes (array)
  if (Array.isArray(subscriptionTypes) && subscriptionTypes.length > 0) {
    user.subscription.subscriptionTypes = subscriptionTypes;
  }

  if (pricingPlan) {
    user.subscription.pricingPlan = pricingPlan;
  }

  if (numberOfOrganizations !== undefined) {
    user.subscription.numberOfOrganizations = numberOfOrganizations;
  }

  if (totalSubscriptionAmount !== undefined) {
    user.subscription.totalSubscriptionAmount = totalSubscriptionAmount;
  }

  // Auto-activate if not free
  if (
    subscriptionTypes &&
    !subscriptionTypes.includes("free")
  ) {
    user.subscription.status = "active";
  }

  await user.save();
};

const updateOrganization = async ({ id, data }) => {
  const organization = await organizationRepo.findOrganizationById(id);

  if (!organization) return null;

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

    // 👇 subscription fields (USER-LEVEL)
    subscriptionTypes,
    pricingPlan,
    numberOfOrganizations,
    totalSubscriptionAmount,
    userId, // 👈 MUST be passed to update subscription
  } = data;

  /* ================= ORGANIZATION UPDATE ================= */

  if (basicInfo) {
    organization.basicInfo = {
      ...organization.basicInfo,
      ...basicInfo,
      media: {
        ...organization.basicInfo?.media,
        ...(basicInfo.media || {}),
      },
      socialLinks: {
        ...organization.basicInfo?.socialLinks,
        ...(basicInfo.socialLinks || {}),
      },
    };
  }

  if (otherInfo) {
    organization.otherInfo = {
      ...organization.otherInfo,
      ...otherInfo,
    };
  }

  if (operatingHours) {
    organization.operatingHours = {
      ...organization.operatingHours,
      ...operatingHours,
    };
  }

  if (status !== undefined) organization.status = status;
  if (location !== undefined) organization.location = location;
  if (pinned !== undefined) organization.pinned = pinned;
  if (image !== undefined) organization.image = image;
  if (tags !== undefined) organization.tags = tags;

  if (description !== undefined) {
    organization.otherInfo = organization.otherInfo || {};
    organization.otherInfo.description = description;
  }

  if (title !== undefined) {
    organization.basicInfo = organization.basicInfo || {};
    organization.basicInfo.name = title;
  }

  /* ================= PRIMARY VENUE ================= */

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

  await organization.save();

  /* ================= SUBSCRIPTION UPDATE ================= */

  if (
    userId &&
    (subscriptionTypes ||
      pricingPlan ||
      numberOfOrganizations !== undefined ||
      totalSubscriptionAmount !== undefined)
  ) {
    const user = await User.findById(userId);
    if (user) {
      await updateUserSubscription({
        user,
        subscriptionTypes,
        pricingPlan,
        numberOfOrganizations,
        totalSubscriptionAmount,
      });
    }
  }

  return formatOrganization(organization);
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

const getOrganizationDetails = async (id) => {
  let org = await organizationRepo.getOrganizationDetails(id);
  return formatOrganization(org);
};

const getOrganizationsAsStaff = async (id) => {
  return await organizationRepo.getOrganizationsAsStaff(id);
};

const getAllOrganizations = async ({ page, limit, keyword, status, creator, date }) => {
  // Initialize the query object
  const query = {};

  // Match organizations where creator field matches the provided creator
  if (creator) {
    query.creator =new mongoose.Types.ObjectId(creator); // Convert creator to ObjectId
  }

  // Apply status filter, if provided
  if (status) {
    query.status = status;
  } else {
    query.status = { $ne: "deleted" };  // Exclude 'deleted' status by default
  }

  // Apply date filter if provided
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  // Apply keyword search if provided
  if (keyword && keyword.trim() !== "") {
    Object.assign(
      query,
      buildKeywordQueryFromModel(Organizations, keyword)
    );
  }

  // Calculate skip for pagination
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Fetch organizations and count based on the query
  let [organizations, counts] = await Promise.all([
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

  // Map the organizations and return only the _id and title
  organizations = organizations.map(org => ({
    _id: org._id,
    title: org.basicInfo.name, // Assuming `title` is within `basicInfo` object
  }));

  return {
    organizations,
    meta
  };
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
  getAllOrganizations
};
