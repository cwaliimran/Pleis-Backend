// repositories/TagsTypeRepository.js
const { Events } = require("@EventsModel");
const Tags = require("@TagsModel");
const Organizations = require("@OrganizationModel");
const { getWithFilters, getModelCounts } = require('@dbUtils/queryUtil');
const { cache, invalidate } = require("@redisCache");

const TagTypesModel = require("./TagTypesModel");
const { createDuplicatedMenu } = require("../menuManagement/menu/menusRepository");

// Create
const createTagsType = async (data) => {
  const Tagstype = new TagTypesModel(data);
  await invalidate("tags:activeTypes");
  return await Tagstype.save();
};

// Get all with filters
const getTagsTypesWithFilters = async (query, page, limit) => {
  return getWithFilters({
    model: TagTypesModel,
    query,
    options: {
      page, limit, select: {
        title: 1,
        _id: 1,
        createdAt: 1,
        status: 1
      }
    },
  });
};

const getActiveTagTypes = async (limit = 15) => {

  return cache({
    namespace: "tags:activeTypes",
    ttl: 86400, // 1 day

    fetchFn: async () => {
      const now = new Date();

      //
      // STEP 1 — Collect tag ids currently being used
      //
      const eventTagPipeline = [
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
        { $group: { _id: "$basicInfo.tags" } }
      ];

      const orgTagPipeline = [
        {
          $match: {
            status: "active",
            "otherInfo.tags": { $exists: true, $ne: [] }
          }
        },
        { $unwind: "$otherInfo.tags" },
        { $group: { _id: "$otherInfo.tags" } }
      ];

      const usedTags = await Events.aggregate([
        ...eventTagPipeline,
        {
          $unionWith: {
            coll: Organizations.collection.name,
            pipeline: orgTagPipeline
          }
        }
      ]);

      if (!usedTags.length) return [];

      const usedTagIds = usedTags.map(t => t._id);

      //
      // STEP 2 — Map those tags → Tag Types + sort by usage
      //
      const pipeline = [
        {
          $match: {
            _id: { $in: usedTagIds },
            status: "active",
            type: { $exists: true, $ne: null }
          }
        },

        {
          $group: {
            _id: "$type",
            usage: { $sum: 1 }
          }
        },

        {
          $lookup: {
            from: "tagtypes",
            localField: "_id",
            foreignField: "_id",
            as: "tagType"
          }
        },

        { $unwind: "$tagType" },

        {
          $project: {
            _id: "$tagType._id",
            title: "$tagType.title"
          }
        },

        { $sort: { usage: -1 } },

        ...(limit ? [{ $limit: limit }] : [])
      ];

      return Tags.aggregate(pipeline);
    }
  });
};

const getCounts = async (query) => {
  return getModelCounts({ model: TagTypesModel, filterQuery: query });
}

// Count by condition
const countTagsTypes = async (query = {}) => {
  return TagTypesModel.countDocuments(query);
};

// Find by ID
const findTagsTypeById = async (id) => {
  return TagTypesModel.findById(id);
};

// Update and save
const updateTagsTypeData = async (Tagstype, data) => {
  Object.assign(Tagstype, data);
  await invalidate("tags:activeTypes");
  return await Tagstype.save();
};

// Delete
const deleteTagsTypeById = async (Tagstype) => {
  await invalidate("tags:activeTypes");
  return await Tagstype.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return TagTypesModel.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createTagsType,
  getTagsTypesWithFilters,
  countTagsTypes,
  findTagsTypeById,
  updateTagsTypeData,
  deleteTagsTypeById,
  findByIdAndUpdate,
  getCounts,
  getActiveTagTypes
};
