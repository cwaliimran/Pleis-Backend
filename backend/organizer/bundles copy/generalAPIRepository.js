const { Bundle } = require("@BundleModel");
const { getModelCounts, getWithFilters } = require("@dbUtils/queryUtil");
const VenueTypesModel = require("@VenueTypesModel");
const Organizations = require("@OrganizationModel");
const Venues = require("@VenuesModel");
const Categories = require("@CategoriesModel");
const Tags = require("@TagsModel");
const { Events } = require("@EventsModel");
const getBundles = async (query = {}, options = {}) => {
  return Bundle.find(query)
    .sort(options.sort || { createdAt: -1 })
    .skip(options.skip || 0)
    .limit(options.limit || 10);
};
const getBundlesCount = async (query) => {
  return getModelCounts({ model: Bundle, filterQuery: query });
}


const getVenueTypesWithFilters = async (query, page, limit) => {
  return getWithFilters({
    model: VenueTypesModel,
    query,
    options: { page, limit },
  });
};


const getOrganizations = async ({
  companyOrganizer,
  page = 1,
  limit = 10,
  keyword,
  status,
  date
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const andConditions = [];

  // ✅ Match company organizer → organization.creator
  if (companyOrganizer) {
    andConditions.push({
      creator: new mongoose.Types.ObjectId(companyOrganizer)
    });
  }

  // ✅ Status filter
  if (status) {
    andConditions.push({ status });
  } else {
    andConditions.push({ status: { $ne: "deleted" } });
  }

  // ✅ Date filter
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    andConditions.push({
      createdAt: { $gte: start, $lt: end }
    });
  }

  // ✅ Keyword filter (organization name)
  if (keyword) {
    andConditions.push({
      "basicInfo.name": { $regex: keyword, $options: "i" }
    });
  }

  const query = andConditions.length ? { $and: andConditions } : {};
  const [organizations, total] = await Promise.all([
    Organizations.find(query)
      .select("_id basicInfo.name")
      .skip(skip)
      .limit(limit === 0 ? 0 : limit)
      .sort({ createdAt: -1 })
      .lean(),

    Organizations.countDocuments(query)
  ]);
  const organizations_ = organizations.map(org => ({
    _id: org._id,
    name: org.basicInfo?.name
  }))

  return {
    organizations: organizations_
  };
};
const getVenues = async ({
  organization,
  page = 1,
  limit = 10,
  keyword,
  status,
  date
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const andConditions = [];

  // ✅ Organization filter (comma or % separated)
  if (organization) {
    const organizationIds = organization
      .split(/[,%]/)
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));

    andConditions.push({
      organization: { $in: organizationIds }
    });
  }

  // ✅ Status filter
  if (status) {
    andConditions.push({ status });
  } else {
    andConditions.push({ status: { $ne: "deleted" } });
  }

  // ✅ Date filter
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    andConditions.push({
      createdAt: { $gte: start, $lt: end }
    });
  }

  // ✅ Keyword filter (venue title)
  if (keyword) {
    andConditions.push({
      title: { $regex: keyword, $options: "i" }
    });
  }

  const query = andConditions.length ? { $and: andConditions } : {};

  // ✅ Fetch venues
  const [venues, total] = await Promise.all([
    Venues.find(query)
      .select("_id title")
      .skip(skip)
      .limit(limit === 0 ? 0 : limit)
      .sort({ createdAt: -1 })
      .lean(),

    Venues.countDocuments(query)
  ]);

  const venues_ = venues.map(venue => ({
    _id: venue._id,
    title: venue.title
  }))

  return {
    Venues: venues_,

  };
};

const getCategories = async ({ organization }) => {
  const query = {};
  if (organization) {
    query.organization = new mongoose.Types.ObjectId(organization);
  }

  query.status = { $ne: "deleted" };

  const categories = await Categories.find(query)
    .select("_id title")
    .sort({ title: 1 })
    .lean();

  return {
    Categories: categories
  };
};
const getTags = async ({ organization }) => {
  const query = {};
  if (organization) {
    query.organization = new mongoose.Types.ObjectId(organization);
  }

  query.status = { $ne: "deleted" };

  const tags = await Tags.find(query)
    .select("_id title")
    .sort({ title: 1 })
    .lean();

  return {
    Tags: tags
  };
};
const getEvents = async ({ organization, creator }) => {
  const query = {
    status: { $ne: "deleted" }
  };
  if (organization) {
    const organizationIds = organization
      .split(/[,%]/)
      .filter(Boolean)
      .map(id => new mongoose.Types.ObjectId(id));

    query["basicInfo.organization"] = { $in: organizationIds };
  }

  else if (creator) {
    query.creator = new mongoose.Types.ObjectId(creator);
  }
  const events = await Events.find(query)
    .select("_id basicInfo.title")
    .sort({ "basicInfo.title": 1 })
    .lean();

  return {
    Events: events
  };
};

module.exports = {
  getBundles,
  getBundlesCount,
  getVenueTypesWithFilters,
  getOrganizations,
  getVenues,
  getCategories,
  getTags,
  getEvents
};