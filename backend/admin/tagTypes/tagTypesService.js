// services/TagstypeService.js
const { generateMeta } = require("../../helperUtils/responseUtil");
// const { formatTagsType } = require("./fomatter/formatTagsType");
const TagstypeRepo = require("./tagTypesRepository");

const createTagsType = async ({ title, status }) => {
  return await TagstypeRepo.createTagsType({ title, status });
};
const getTagsTypes = async ({ page, limit, keyword, status, date }) => {
  const andConditions = [];
  // if date is available then match createdAt with date current date format is yyyy-mm-dd
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


  const [TagsTypes, counts] =
    await Promise.all([
      TagstypeRepo.getTagsTypesWithFilters(
        query,
        page,
        limit
      ),
      TagstypeRepo.getCounts(query),
    ]);



  const { totalFiltered, total, active, inactive } = counts;
  let meta = generateMeta(page, limit, totalFiltered);
  meta.TagsTypesCount = { total, active, inactive };
  return {
    TagsTypes,
    meta,
  };
};

const getPublicTagsTypes = async ({ page, limit, keyword, date }) => {
  const baseFilters = [{ status: "active" }];
  //if date is available then match createdAt with date current date format is yyyy-mm-dd
  if (date) {
    baseFilters.push({
      createdAt: {
        $gte: new Date(date),
        $lt: new Date(new Date(date).setDate(new Date(date).getDate() + 1)),
      },
    });
  }

  if (keyword) {
    baseFilters.push({
      $or: [
        { title: { $regex: keyword, $options: "i" } },
        // Add more fields here if needed
      ],
    });
  }

  const baseQuery = baseFilters.length ? { $and: baseFilters } : {};


  const [TagsTypes, totalFiltered] =
    await Promise.all([
      page === 1
        ? TagstypeRepo.getTagsTypesWithFilters(baseQuery, page,
          limit)
        : [],

      TagstypeRepo.countTagsTypes(baseQuery),
    ]);

    const formattedTagsTypes = TagsTypes.map(item => formatTagsType(item));

  let meta = generateMeta(page, limit, totalFiltered);

  return {
    TagsTypes: formattedTagsTypes,
    meta,
  };
};

const updateTagsType = async (id, data) => {
  // Only update provided fields
  const updateData = {
    ...(data.title !== undefined && { title: data.title }),
    ...(data.status !== undefined && { status: data.status }),
  };

  if (Object.keys(updateData).length === 0) {
    const Tagstype = await TagstypeRepo.findTagsTypeById(id);
    return Tagstype;
  }

  const updated = await TagstypeRepo.findByIdAndUpdate(id, updateData);
  return updated;
};

const deleteTagsType = async (id) => {
  const updated = await TagstypeRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

module.exports = {
  createTagsType,
  getTagsTypes,
  updateTagsType,
  deleteTagsType,
  getPublicTagsTypes,
};
