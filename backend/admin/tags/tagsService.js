// services/tagService.js
const tagRepo = require("./tagsRepository");

const createTag = async ({ title, description, status }) => {
  return await tagRepo.createTag({ title, description, status });
};

const getTags = async ({ page, limit, keyword, status }) => {
  const query = {};
  if (status) query.status = status;
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [tags, totalFiltered, total, active, inactive] = await Promise.all([
    tagRepo.getTagsWithFilters(query, skip, limit === 0 ? 0 : limit),
    tagRepo.countTags(query),
    tagRepo.countTags({}),
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
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [tags, totalFiltered] = await Promise.all([
    tagRepo.getTagsWithFilters(query, skip, limit === 0 ? 0 : limit),
    tagRepo.countTags(query),
  ]);

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
  const tag = await tagRepo.findTagById(id);
  if (!tag) return null;

  const updated = await tagRepo.updateTagData(tag, data);
  return updated;
};

const deleteTag = async (id) => {
  const tag = await tagRepo.findTagById(id);
  if (!tag) return null;

  await tagRepo.deleteTagById(tag);
  return true;
};

module.exports = {
  createTag,
  getTags,
  updateTag,
  deleteTag,
  getPublicTags,
};
