// services/tagService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
const TagTypesModel = require("../tagTypes/TagTypesModel");
const tagRepo = require("./tagsRepository");

const createTag = async ({ title, status, type }) => {
  return await tagRepo.createTag({ title, status, type });
};

const getTags = async ({ page, limit, keyword, type, status, date }) => {
  const filters = [];

  if (date) {
    filters.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
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

  const query = filters.length ? { $and: filters } : {};

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Fetch tags and related counts
  const [tags, totalFiltered, total, active, inactive] = await Promise.all([
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





const getPublicTags = async () => {
  let tags = await tagRepo.getActiveTags(15);
  return {
    tags,
  };
};


const updateTag = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
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
