// services/highlightService.js

const highlightRepo = require("./highlightRepository");
const eventRepository = require("../../admin/events/eventRepository");
const organizationRepo = require("../organizations/organizationRepository");
const { Highlights } = require("@HighlightsModel");
const { formatPublicHighlightResponse } = require("./formatters/formatPublicHighlightResponse");
const {Events} = require("@EventsModel");
const mongoose = require("mongoose");
const createHighlight = async ({ data }) => {
  return await highlightRepo.createHighlight(data);
};

const getHighlights = async ({
  organization,
  page = 1,
  limit = 10,
  keyword,
  status,
  creator,
  date,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  /* ================================
     NORMALIZE ORGANIZATION IDS
  ================================= */
  let organizationIds = [];

  if (organization) {
    if (Array.isArray(organization)) {
      organizationIds = organization;
    } else if (typeof organization === "string") {
      organizationIds = organization.split(/[, %]+/);
    }

    organizationIds = organizationIds
      .filter(Boolean)
      .map((id) => new mongoose.Types.ObjectId(id));
  }

  /* ================================
     BUILD PIPELINE
  ================================= */
  const pipeline = [];

  /* ---------- BASE FILTER ---------- */
  if (!organization) {
    pipeline.push({
      $match: { creator: new mongoose.Types.ObjectId(creator) },
    });
  }

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } },
    });
  }

  /* ================================
     LOOKUP EVENT (ONLY FOR EVENT TYPE)
  ================================= */
  pipeline.push({
    $lookup: {
      from: "events",
      localField: "object",
      foreignField: "_id",
      pipeline: [
        {
          $project: {
            "basicInfo.title": 1,
            "basicInfo.organization": 1,
          },
        },
      ],
      as: "event",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$event",
      preserveNullAndEmptyArrays: true,
    },
  });

  /* ================================
     ORGANIZATION FILTER
  ================================= */
  if (organizationIds.length > 0) {
    pipeline.push({
      $match: {
        $or: [
          // Organization highlights
          {
            type: "organization",
            object: { $in: organizationIds },
          },

          // Event highlights → event.organization
          {
            type: "event",
            "event.basicInfo.organization": { $in: organizationIds },
          },
        ],
      },
    });
  }

  /* ================================
     KEYWORD SEARCH
  ================================= */
  if (keyword) {
    pipeline.push({
      $match: {
        $or: [
          { title: { $regex: keyword, $options: "i" } },
          { "event.basicInfo.title": { $regex: keyword, $options: "i" } },
        ],
      },
    });
  }

  /* ================================
     LOOKUP ORGANIZATION
  ================================= */
  pipeline.push({
    $lookup: {
      from: "organizations",
      let: {
        orgId: {
          $cond: [
            { $eq: ["$type", "organization"] },
            "$object",
            "$event.basicInfo.organization",
          ],
        },
      },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$_id", "$$orgId"] },
          },
        },
        {
          $project: {
            basicInfo: 1,
            _id: 1,
          },
        },
      ],
      as: "organization",
    },
  });

  pipeline.push({
    $unwind: {
      path: "$organization",
      preserveNullAndEmptyArrays: true,
    },
  });

  /* ================================
     SORT + PAGINATION
  ================================= */
  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      totalFiltered: [{ $count: "count" }],
    },
  });

  /* ================================
     EXECUTE
  ================================= */
  const result = await Highlights.aggregate(pipeline);
    let highlights = result[0]?.data || [];
    highlights = highlights.map((highlight) => {
    return formatPublicHighlightResponse(highlight);
  });


  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  return {
    highlights,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};



const getPublicHighlights = async ({ page, limit, keyword, userLocation }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;


  let [highlights, totalFiltered] = await Promise.all([
    highlightRepo.getPublicHighlightsWithFilters(
      query,
      keyword,
      skip,
      limit === 0 ? 0 : limit
    ),
    highlightRepo.countHighlights(query),
  ]);

  highlights = highlights.map((highlight) => {
    return formatPublicHighlightResponse(highlight, { userLocation });
  });

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
