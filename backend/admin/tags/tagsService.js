// services/tagService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const tagRepo = require("./tagsRepository");

const createTag = async ({ title, status, type }) => {
  return await tagRepo.createTag({ title, status, type });
};

const getTags = async ({ page, limit, keyword, type, status, pinned, date }) => {
  const filters = [];

  // if date is available then match createdAt with date current date format is yyyy-mm-dd
  if (date) {
    filters.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (type) {
    filters.push({ type });
  }

  if (status) {
    filters.push({ status });
  } else {
    filters.push({ status: { $ne: "deleted" } });
  }

  if (keyword) {
    filters.push({
      $or: [{ title: { $regex: keyword, $options: "i" } }],
    });
  }

  if (pinned !== undefined) {
    filters.push({ pinned });
  }

  const query = filters.length ? { $and: filters } : {};

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [tags, totalFiltered, total, active, inactive] =
    await Promise.all([
      tagRepo.getTagsWithFilters(query, skip, limit === 0 ? 0 : limit),
      tagRepo.countTags(query),
      tagRepo.countTags({ status: { $ne: "deleted" } }),
      tagRepo.countTags({ status: "active" }),
      tagRepo.countTags({ status: "inactive" }),
    ]);

  return {
    tags,
    meta: {
      page,
      limit,
      total: totalFiltered,
      tagsCount: { total, active, inactive },
    },
  };
};


const getPublicTags = async ({ page, limit, keyword }) => {
  const baseFilters = [{ status: "active" }];

  if (keyword) {
    baseFilters.push({
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        // Add more fields here if needed
      ]
    });
  }

  // Final base query (e.g., status + keyword)
  const baseQuery = baseFilters.length ? { $and: baseFilters } : {};

  // Pinned filter
  const pinnedQuery = { ...baseQuery, pinned: true };

  // Unpinned filter
  const unpinnedConditions = {
    $or: [
      { pinned: false },
      { pinned: null },
      { pinned: { $exists: false } },
    ]
  };
  const unpinnedQuery = {
    $and: [...(baseQuery.$and || []), unpinnedConditions],
  };

  // Always paginate unpinned
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [pinnedTags, unpinnedTags, totalFiltered] = await Promise.all([
    page === 1 ? tagRepo.getTagsWithFilters(pinnedQuery, 0, 0) : [],
    tagRepo.getTagsWithFilters(unpinnedQuery, skip, limit === 0 ? 0 : limit),
    tagRepo.countTags(baseQuery),
  ]);

  const totalPages = (limit && totalFiltered != null) ? Math.ceil(totalFiltered / limit) : 1;

  const tags = {
    pinned: pinnedTags,
    unpinned: unpinnedTags,
  };
  let meta = generateMeta(page, limit, totalPages);
  return {
    tags,
    meta,
  };
};




const updateTag = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.pinned !== undefined && { pinned: data.pinned }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.type !== undefined && { type: data.type }),
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
