// services/featureService.js

const { generateMeta } = require("../../helperUtils/responseUtil");
const featureRepo = require("./featureRepository");

const createFeature = async ({ data }) => {
  return await featureRepo.createFeature(data);
};

const getFeatures = async ({ page, limit, keyword, status, creator, date }) => {
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

  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [features, totalFiltered, total, active, inactive] =
    await Promise.all([
      featureRepo.getFeaturesWithFilters(
        query,
        skip,
        limit === 0 ? 0 : limit
      ),
      featureRepo.countFeatures(query),
      featureRepo.countFeatures({ status: { $ne: "deleted" } }),
      featureRepo.countFeatures({ status: "active" }),
      featureRepo.countFeatures({ status: "inactive" }),
    ]);
  let meta = generateMeta(page, limit, totalFiltered);
  meta.featuresCount = { total, active, inactive };
  return {
    features,
    meta
  };
};

const getPublicFeatures = async ({ page, limit, keyword }) => {
  const query = { status: "active" };
  if (keyword) {
    query.$or = [
      { title: { $regex: keyword, $options: "i" } },
    ];
  }

  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const [features, totalFiltered] = await Promise.all([
    featureRepo.getFeaturesWithFilters(
      query,
      skip,
      limit === 0 ? 0 : limit
    ),
    featureRepo.countFeatures(query),
  ]);

  return {
    features,
    meta: {
      page,
      limit,
      total: totalFiltered,
    },
  };
};

const updateFeature = async (id, data) => {
  const feature = await featureRepo.findFeatureDocById(id);
  if (!feature) return null;
  const {
    title,
    key,
    status,
  } = data;

  if (title !== undefined) {
    feature.title = title;
  }

  if (key !== undefined) {
    feature.key = key;
  }

  if (status !== undefined) {
    feature.status = status;
  }

  await feature.save();

  return feature;
};


const deleteFeature = async (id) => {
  const updated = await featureRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const findFeatureById = async (id) => {
  return await featureRepo.findFeatureById(id);
};

//find feature by specific query against key in schema e.g status:active
//to use this pass query as : { status: "active" }
const findFeatureByQuery = async (query) => {
  return await featureRepo.findFeatureByQuery(query);
};

module.exports = {
  createFeature,
  getFeatures,
  updateFeature,
  deleteFeature,
  getPublicFeatures,
  findFeatureByQuery,
  findFeatureById,
};
