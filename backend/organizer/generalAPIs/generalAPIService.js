const { generateMeta, getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const generalAPIRepo = require("./generalAPIRepository");
const { formatVenueType } = require("../venueTypes/fomatter/formatVenueType");
const Organizations = require("@OrganizationModel");
const Venues = require("@VenuesModel");


const getOrganizations = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  companyOrganizer
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });

  let data = await generalAPIRepo.getOrganizations({
    timezone,
    page,
    limit,
    keyword,
    status,
    today,
    skip,
    companyOrganizer
  });

  return data;
};


const getVenueTypes = async ({ page, limit, keyword, status, date }) => {
  const andConditions = [];
  if (date) {
    andConditions.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (status) {
    andConditions.push({ status });
  } else {
    andConditions.push({ status: { $ne: "deleted" } });
  }

  if (keyword) {
    andConditions.push({
      $or: [{ title: { $regex: keyword, $options: "i" } }],
    });
  }

  const query = andConditions.length > 0 ? { $and: andConditions } : {};


  const [venueTypes, counts] =
    await Promise.all([
      generalAPIRepo.getVenueTypesWithFilters(
        query,
        page,
        limit
      ),
    ]);
  const formattedVenueTypes = venueTypes.map(item => formatVenueType(item));
  return {
    venueTypes: formattedVenueTypes
  };
};


const getVenues = async ({
  page,
  limit,
  keyword,
  status,
  date,
  organization
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let data = await generalAPIRepo.getVenues({
    page,
    limit,
    keyword,
    status,
    date,
    organization,
    skip
  });

  return data;
};
const getCategories = async ({
  page,
  limit,
  keyword,
  status,
  date,
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let data = await generalAPIRepo.getCategories({
    page,
    limit,
    keyword,
    status,
    date,
    skip
  });

  return data;
};
const getTags = async ({
  page,
  limit,
  keyword,
  status,
  date,
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let Tags = await generalAPIRepo.getTags({
    page,
    limit,
    keyword,
    status,
    date,
    skip
  });

  return Tags;
};
const getEvents = async ({
  page,
  limit,
  keyword,
  status,
  date,
  organization,
  creator
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let Events = await generalAPIRepo.getEvents({
    page,
    limit,
    keyword,
    status,
    date,
    skip,
    organization,
    creator
  });

  return Events;
};
const getmenuItemCategories = async ({
  page,
  limit,
  keyword,
  status,
  date,
  companyOrganizer
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let itemCategories = await generalAPIRepo.getmenuItemCategories({
    page,
    limit,
    keyword,
    status,
    date,
    skip,
    companyOrganizer
  });

  return itemCategories;
};
const getmenuItem = async ({
  page,
  limit,
  keyword,
  status,
  date,
  creator,
  menu
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let itemCategories = await generalAPIRepo.getmenuItem({
    page,
    limit,
    keyword,
    status,
    date,
    skip,
    creator,
    menu
  });

  return itemCategories;
};
const getmenu = async ({
  page,
  limit,
  keyword,
  status,
  date,
  organization,
  creator
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let menu = await generalAPIRepo.getmenu({
    page,
    limit,
    keyword,
    status,
    date,
    skip,
    organization,
    creator
  });

  return menu;
};
const getTiers = async ({
  page,
  limit,
  keyword,
  status,
  date,
  creator
}) => {
  page = Number(page) || 1;
  limit = Number(limit);
  if (limit) {
    limit += 1;
  }

  if (Number.isNaN(limit) || limit < 0) {
    limit = 10;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  let tiers = await generalAPIRepo.getTiers({
    page,
    limit,
    keyword,
    status,
    date,
    skip,
    creator
  });

  return tiers;
};
module.exports = {
  getmenu, getmenuItem,getTiers,

  getmenuItemCategories, getOrganizations, getVenueTypes, getVenues, getCategories, getTags, getEvents

};