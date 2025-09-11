// services/highlightService.js

const highlightRepo = require("./highlightRepository");
const eventRepository = require("../events/eventRepository");
const organizationRepo = require("../organizations/organizationRepository");

const createHighlight = async ({ data }) => {
  return await highlightRepo.createHighlight(data);
};

const getHighlights = async ({ page, limit, keyword, status, creator, date}) => {
  const query = {};
  if (creator) query.creator = creator;
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
  // if (keyword) {
  //   query.$or = [
  //     { title: { $regex: keyword, $options: "i" } },
  //     { description: { $regex: keyword, $options: "i" } },
  //   ];
  // }
// logger.log("query",query)
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [highlights, totalFiltered, total, active, inactive] =
    await Promise.all([
      highlightRepo.getHighlightsWithFilters(
        query,
        keyword,
        skip,
        limit === 0 ? 0 : limit
      ),
      highlightRepo.countHighlights(query),
      highlightRepo.countHighlights({status: {$ne: "deleted"}}),
      highlightRepo.countHighlights({ status: "active" }),
      highlightRepo.countHighlights({ status: "inactive" }),
    ]);

  return {
    highlights,
    meta: {
      page,
      limit,
      total: totalFiltered,
      tagsCount: { total, active, inactive },
    },
  };
};

const getPublicHighlights = async ({ page, limit, keyword }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [highlights, totalFiltered] = await Promise.all([
    highlightRepo.getHighlightsWithFilters(
      query,
      skip,
      limit === 0 ? 0 : limit
    ),
    highlightRepo.countHighlights(query),
  ]);

  return {
    highlights,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateHighlight = async (id, data) => {
  const highlight = await highlightRepo.findHighlightDocById(id);
  if (!highlight) return null;
  const {
    media,
    title,
    type,
    object,
    status,
  } = data;
  // Safe assignment logic based on destructured data
  if (media !== undefined) {
    highlight.media = {
      ...highlight.media,
      ...(media || {})
    };
  }

  if (title !== undefined) {
    highlight.title = title;
  }

  if (type !== undefined) {
    highlight.type = type;
  }

  if (object !== undefined) {
    highlight.object = object;
  }

  if (status !== undefined) {
    highlight.status = status;
  }

  await highlight.save();

  return highlight;
};


const deleteHighlight = async (id) => {
  const updated = await highlightRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getHighlightDetails = async (id, timezone) => {
  const highlight = await highlightRepo.findHighlightById(id);
  if (!highlight) return null;
  return highlight;
};

const validateEvent = async (id) => {
  const event = await eventRepository.findEventById(id);
  if (!event) return null;
  return event;
};

const validateOrganization = async (id) => {
  const organization = await organizationRepo.findOrganizationById(id);
  if (!organization) return null;
  return organization;
};

module.exports = {
  createHighlight,
  getHighlights,
  updateHighlight,
  deleteHighlight,
  getPublicHighlights,
  getHighlightDetails,
  validateEvent,
  validateOrganization,
};
