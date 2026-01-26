// repositories/highlightRepository.js
const { Highlights } = require("@HighlightsModel");
const { default: mongoose } = require("mongoose");
const { getModelCounts } = require("@dbUtils/queryUtil");
const { getAllUsers } = require("../usersManagement/usersService");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_HIGHLIGHTS_CACHE_KEY = "highlights:active";
const buildHighlightsCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_HIGHLIGHTS_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};




// Create
const createHighlight = async (data) => {
  const highlight = new Highlights(data);
  const userIds = (await getAllUsers({ page: 1, limit: 1000000 })).users.map(user => user._id.toString());
  await sendUserNotifications({
    recipientIds: userIds,
    title: `A new highlight "${highlight.title}" has been created.`,
    body: `A new highlight "${highlight.title}" is now available in the system.`,
    data: { type: NotificationTypes.HIGHLIGHT_CREATED, highlightId: highlight._id, objectType: "highlights" },
    sender: highlight.creator,
    objectId: highlight._id,
    image: highlight.media.type === 'image' ? event.basicInfo.media.name : null,

  });
  await invalidate(ACTIVE_HIGHLIGHTS_CACHE_KEY);
  return await highlight.save();
};

// Get highlights with filters
const getHighlightsWithFilters = async (query, keyword, skip, limit) => {
  const cacheKey = buildHighlightsCacheKey({
    scope: "admin",
    skip,
    limit,
  });
  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      const now = new Date();
      const pipeline = [
        { $match: query },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },

        // Lookup from Events
        {
          $lookup: {
            from: "events",
            localField: "object",
            foreignField: "_id",
            as: "eventObject"
          }
        },
        // Lookup from Organizations
        {
          $lookup: {
            from: "organizations",
            localField: "object",
            foreignField: "_id",
            as: "orgObject"
          }
        },
        // Replace 'object' field
        {
          $addFields: {
            object: {
              $cond: [
                { $eq: ["$type", "event"] },
                { $arrayElemAt: ["$eventObject", 0] },
                { $arrayElemAt: ["$orgObject", 0] }
              ]
            }
          }
        }
      ];

      // Apply keyword filter AFTER lookup
      if (keyword) {
        const regex = { $regex: keyword, $options: "i" };

        pipeline.push({
          $match: {
            $or: [
              { title: regex }, // highlight title
              { "media.name": regex }, // highlight media
              { "object.basicInfo.title": regex }, // event title
              { "object.basicInfo.name": regex }, // org name
              { "object.basicInfo.description": regex }, // event description
              { "object.basicInfo.otherInfo.description": regex }, // org description
              { "object.basicInfo.socialLinks.facebook": regex },
              { "object.basicInfo.socialLinks.instagram": regex },
              { "object.basicInfo.socialLinks.linkedin": regex },
              { "object.basicInfo.socialLinks.youtube": regex }
            ]
          }
        });
      }

      pipeline.push({
        $project: {
          "object._id": 1,
          "object.basicInfo.media": 1,
          "object.basicInfo.title": 1,
          "object.basicInfo.name": 1,
          type: 1,
          createdAt: 1,
          meta: 1,
          status: 1,
          title: 1,
          media: 1,
        }
      });
      const result = await Highlights.aggregate(pipeline);
      // ❗ DO NOT CACHE EMPTY LISTS
      if (!result || result.length === 0) {
        return [];
      }

      return result;
    }
  });
};


const getPublicHighlightsWithFilters = async (query, keyword, skip, limit) => {
  const cacheKey = buildHighlightsCacheKey({
    scope: "public",
    skip,
    limit,
  });
  return cache({
    namespace: cacheKey,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      const pipeline = [
        { $match: query },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },

        // --- Lookup from Events (and populate organization) ---
        {
          $lookup: {
            from: "events",
            localField: "object",
            foreignField: "_id",
            as: "eventObject",
            pipeline: [
              {
                $lookup: {
                  from: "organizations",
                  localField: "basicInfo.organization",
                  foreignField: "_id",
                  as: "organizationInfo",
                  pipeline: [
                    {
                      $project: {
                        _id: 1,
                        "basicInfo.media.logo": 1,
                        "basicInfo.name": 1,
                      },
                    },
                  ],
                },
              },
              {
                $addFields: {
                  "basicInfo.organization": { $arrayElemAt: ["$organizationInfo", 0] },
                },
              },
              {
                $project: {
                  _id: 1,
                  basicInfo: 1,
                  schedule: 1,
                  status: 1,
                },
              },
            ],
          },
        },

        // --- Lookup from Organizations (direct highlight reference) ---
        {
          $lookup: {
            from: "organizations",
            localField: "object",
            foreignField: "_id",
            as: "orgObject",
          },
        },

        // --- Merge correct object based on highlight type ---
        {
          $addFields: {
            object: {
              $cond: [
                { $eq: ["$type", "event"] },
                { $arrayElemAt: ["$eventObject", 0] },
                { $arrayElemAt: ["$orgObject", 0] },
              ],
            },
          },
        },
      ];

      // --- Keyword filter after lookups ---
      if (keyword) {
        const regex = { $regex: keyword, $options: "i" };

        pipeline.push({
          $match: {
            $or: [
              { title: regex }, // highlight title
              { "media.name": regex }, // highlight media
              { "object.basicInfo.title": regex }, // event title
              { "object.basicInfo.name": regex }, // org name
              { "object.basicInfo.description": regex }, // event/org description
              { "object.basicInfo.organization.basicInfo.name": regex }, // nested org inside event
              { "object.basicInfo.socialLinks.facebook": regex },
              { "object.basicInfo.socialLinks.instagram": regex },
              { "object.basicInfo.socialLinks.linkedin": regex },
              { "object.basicInfo.socialLinks.youtube": regex },
            ],
          },
        });
      }

      // --- Final projection ---
      pipeline.push({
        $project: {
          "object._id": 1,
          "object.basicInfo.title": 1,
          "object.basicInfo.name": 1,
          "object.basicInfo.venueLocation": 1,
          "object.basicInfo.media": 1,
          "object.basicInfo.description": 1,
          "object.basicInfo.organization.basicInfo.name": 1,
          "object.basicInfo.organization.basicInfo.media": 1,
          type: 1,
          createdAt: 1,
          meta: 1,
          status: 1,
          title: 1,
          media: 1,
        },
      });

      const result = await Highlights.aggregate(pipeline);
      // ❗ DO NOT CACHE EMPTY LISTS
      if (!result || result.length === 0) {
        return [];
      }

      return result;
    }
  });
};

const getHighlightsCounts = async (query) => {
  return getModelCounts({ model: Highlights, filterQuery: query });
}

// Count by condition
const countHighlights = async (query = {}) => {
  return Highlights.countDocuments(query);
};

// Find by ID
const findHighlightById = async (id) => {
  const highlights = await Highlights.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },

    // Lookup from Events
    {
      $lookup: {
        from: "events",
        localField: "object",
        foreignField: "_id",
        as: "eventObject"
      }
    },
    // Lookup from Organizations
    {
      $lookup: {
        from: "organizations",
        localField: "object",
        foreignField: "_id",
        as: "orgObject"
      }
    },

    // Replace 'object' field with correct populated result
    {
      $addFields: {
        object: {
          $cond: [
            { $eq: ["$type", "event"] },
            { $arrayElemAt: ["$eventObject", 0] },
            { $arrayElemAt: ["$orgObject", 0] }
          ]
        }
      }
    },

    // Project final shape
    {
      $project: {
        "object._id": 1,
        "object.basicInfo.media": 1,

        // Conditionally include title only for type 'event'
        "object.basicInfo.title": {
          $switch: {
            branches: [
              {
                case: { $eq: ["$type", "event"] },
                then: "$object.basicInfo.title"
              }
            ],
            default: "$$REMOVE"
          }
        },

        // Conditionally include name only for type 'organization'
        "object.basicInfo.name": {
          $switch: {
            branches: [
              {
                case: { $eq: ["$type", "organization"] },
                then: "$object.basicInfo.name"
              }
            ],
            default: "$$REMOVE"
          }
        },

        type: 1,
        createdAt: 1,
        meta: 1,
        status: 1,
        title: 1,
        media: 1
      }
    }
  ]);

  return highlights[0] || null;
};

const findHighlightDocById = async (id) => {
  return await Highlights.findById(id);
};


// Delete
const deleteHighlightById = async (highlight) => {
  await invalidate(ACTIVE_HIGHLIGHTS_CACHE_KEY);
  return await highlight.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  await invalidate("highlights");
  console.log("Invalidated highlights cache");
  return Highlights.findByIdAndUpdate(id, { $set: data }, { new: true });
};
module.exports = {
  createHighlight,
  getHighlightsWithFilters,
  countHighlights,
  findHighlightById,
  findHighlightDocById,
  deleteHighlightById,
  findByIdAndUpdate,
  getPublicHighlightsWithFilters,
  getHighlightsCounts,
};
