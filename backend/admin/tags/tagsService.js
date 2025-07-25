// services/tagService.js
const tagRepo = require("./tagsRepository");

const createTag = async ({ title, status }) => {
  return await tagRepo.createTag({ title, status });
};

const getTags = async ({ page, limit, keyword, status, pinned }) => {
  const query = {};
  if (status) query.status = status;
  if (keyword) {
    query.$or = [{ title: { $regex: keyword, $options: "i" } }];
  }
  if (pinned !== undefined) {
   query.pinned = pinned;
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [tags, totalFiltered, total, active, inactive, deleted] =
    await Promise.all([
      tagRepo.getTagsWithFilters(query, skip, limit === 0 ? 0 : limit),
      tagRepo.countTags(query),
      tagRepo.countTags({}),
      tagRepo.countTags({ status: "active" }),
      tagRepo.countTags({ status: "inactive" }),
      tagRepo.countTags({ status: "deleted" }),
    ]);

  return {
    tags,
    meta: {
      page,
      limit,
      total: totalFiltered,
      tagsCount: { total, active, inactive, deleted },
    },
  };
};

const getPublicTags = async ({ page, limit, keyword }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  // Always get pinned tags first
  const pinnedQuery = { ...query, pinned: true };
  const unpinnedQuery = { ...query, $or: [
      { pinned: false },
      { pinned: null },
      { pinned: { $exists: false } }
    ]
  };

  // Only skip when keyword is applied
  const skip = keyword ? (limit === 0 ? 0 : (page - 1) * limit) : 0;

  // Get pinned tags (no skip/limit), then unpinned tags (with skip/limit if no keyword)
  const [pinnedTags, unpinnedTags, totalFiltered] = await Promise.all([
    tagRepo.getTagsWithFilters(pinnedQuery, 0, 0), // all pinned
    tagRepo.getTagsWithFilters(unpinnedQuery, skip, limit === 0 ? 0 : limit), // paginated unpinned
    tagRepo.countTags(query),
  ]);

  // Combine pinned tags on top
  const tags = [...pinnedTags, ...unpinnedTags];

  return {
    tags,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateTag = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.pinned !== undefined && { pinned: data.pinned }),
    ...(data.status !== undefined && { status: data.status }),
  };

  if (Object.keys(updateData).length === 0) {
    const tag = await tagRepo.findTagById(id);
    return tag;
  }

  const updated = await tagRepo.findTagByIdAndUpdate(id, updateData);
  return updated;
};

const deleteTag = async (id) => {
  const updated = await tagRepo.findTagByIdAndUpdate(id, { status: "deleted" });
  if (!updated) return null;
  return true;
};

module.exports = {
  createTag,
  getTags,
  updateTag,
  deleteTag,
  getPublicTags,
};
