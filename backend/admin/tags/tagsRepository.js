// repositories/tagRepository.js
const { Events } = require("@EventsModel");
const Tags = require("@TagsModel");
const Organizations = require("@OrganizationModel");
const { cache, invalidate } = require("@redisCache");

const ACTIVE_TAGS_CACHE_KEY = "tags:active";

/**
 * CREATE
 */
const createTag = async (data) => {
  const tag = new Tags(data);
  const saved = await tag.save();

  await invalidate(ACTIVE_TAGS_CACHE_KEY);

  return saved;
};

/**
 * ADMIN LISTING (no cache)
 */
const getTagsWithFilters = async (
  query,
  skip = 0,
  limit = 20,
  sortBy = "createdAt",
  sortOrder = "desc"
) => {
  const sortDirection = sortOrder === "asc" ? 1 : -1;

  const pipeline = [{ $match: query }];





  // Populate 'type' field
  pipeline.push({
    $lookup: {
      from: "tagtypes", // Collection name
      localField: "type",
      foreignField: "_id",
      as: "type",
      pipeline: [{ $project: { _id: 1, title: 1 } }],
    },
  });

  pipeline.push({
    $unwind: { path: "$type", preserveNullAndEmptyArrays: true },
  });

  if (sortBy === "title") {
    pipeline.push({
      $addFields: {
        titleSort: { $toLower: { $ifNull: ["$title", ""] } },
      },
    });
    pipeline.push({ $sort: { titleSort: sortDirection, _id: -1 } });
  } else if (sortBy === "typeTitle") {
    pipeline.push({
      $addFields: {
        typeTitleSort: {
          $toLower: {
            $ifNull: ["$type.title", ""] // empty string if type is null
          }
        }
      }
    });
    pipeline.push({
      $sort: { typeTitleSort: sortDirection, _id: -1 }
    });
  } else {
    pipeline.push({ $sort: { createdAt: sortDirection, _id: -1 } });
  }
  pipeline.push({ $skip: skip });
  if (limit > 0) pipeline.push({ $limit: limit });

  return Tags.aggregate(pipeline);
};
/**
 * PUBLIC — ACTIVE TAGS (CACHED)
 * Sorted by most used across:
 *  - upcoming events
 *  - active organizations
 */
const getActiveTags = async () => {
  //invalidate ACTIVE_TAGS_CACHE_KEY
  return cache({
    namespace: ACTIVE_TAGS_CACHE_KEY,
    ttl: 86400, // 1 day

    fetchFn: async () => {
      const now = new Date();

      //
      // STEP 1 — TAG USAGE FROM UPCOMING EVENTS
      //
      const eventTagsPipeline = [
        {
          $match: {
            status: "active",
            $or: [
              { "schedule.endDateTime": { $gte: now } },
              { "schedule.startDateTime": { $gte: now } }
            ]
          }
        },
        { $unwind: "$basicInfo.tags" },
        {
          $group: {
            _id: "$basicInfo.tags",
            usage: { $sum: 1 }
          }
        }
      ];

      //
      // STEP 2 — TAG USAGE FROM ORGANIZATIONS
      //
      const orgTagsPipeline = [
        {
          $match: {
            status: "active",
            "otherInfo.tags": { $exists: true, $ne: [] }
          }
        },
        { $unwind: "$otherInfo.tags" },
        {
          $group: {
            _id: "$otherInfo.tags",
            usage: { $sum: 1 }
          }
        }
      ];

      //
      // STEP 3 — MERGE + LOOKUP TAG DOCUMENTS
      //
      const pipeline = [
        {
          $unionWith: {
            coll: Organizations.collection.name,
            pipeline: orgTagsPipeline
          }
        },

        // combine usage counts
        {
          $group: {
            _id: "$_id",
            totalUsage: { $sum: "$usage" }
          }
        },

        // lookup tag fields
        {
          $lookup: {
            from: "tags",
            localField: "_id",
            foreignField: "_id",
            pipeline: [
              {
                $match: {
                  status: "active"
                }
              }
            ],
            as: "tag"
          }
        },

        { $unwind: "$tag" },
        {
          $lookup: {
            from: "tagtypes",
            localField: "tag.type",
            foreignField: "_id",
            pipeline: [
              {
                $match: {
                  status: "active"
                }
              },
              { $project: { title: 1 } }
            ],
            as: "tag.type"
          }
        },

        { $unwind: "$tag.type" },

        {
          $project: {
            _id: "$tag._id",
            title: "$tag.title",

            type: "$tag.type",
            // totalUsage: 1
          }
        },

        { $sort: { totalUsage: -1 } },

      ];

      const result = await Events.aggregate(eventTagsPipeline.concat(pipeline));

      // ❗ DO NOT CACHE EMPTY LISTS
      if (!result || result.length === 0) {
        return [];
      }

      return result;
    }
  });
};

/**
 * COUNT
 */
const countTags = async (query = {}) => {
  return Tags.countDocuments(query);
};

/**
 * FIND BY ID
 */
const findTagById = async (id) => {
  return Tags.findById(id);
};

/**
 * UPDATE
 */
const updateTagData = async (tag, data) => {
  Object.assign(tag, data);

  const updated = await tag.save();

  await invalidate(ACTIVE_TAGS_CACHE_KEY);

  return updated;
};

/**
 * DELETE
 */
const deleteTagById = async (tag) => {
  const result = await tag.deleteOne();

  await invalidate(ACTIVE_TAGS_CACHE_KEY);

  return result;
};

/**
 * FIND + UPDATE
 */
const findTagByIdAndUpdate = async (id, data) => {
  const updated = await Tags.findByIdAndUpdate(id, data, { new: true });

  await invalidate(ACTIVE_TAGS_CACHE_KEY);

  return updated;
};

module.exports = {
  createTag,
  getTagsWithFilters,
  countTags,
  findTagById,
  updateTagData,
  deleteTagById,
  findTagByIdAndUpdate,
  getActiveTags
};
