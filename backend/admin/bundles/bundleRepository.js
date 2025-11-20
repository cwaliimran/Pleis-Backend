const { Bundle } = require("@BundleModel");
const { getModelCounts } = require("@dbUtils/queryUtil");

const createBundle = async (data) => {
  const bundle = new Bundle(data);
  return bundle.save();
};

const getBundles = async (query = {}, options = {}) => {
  return Bundle.find(query)
    .sort(options.sort || { createdAt: -1 })
    .skip(options.skip || 0)
    .limit(options.limit || 10);
};

const getBundleById = async (id) => {
  return Bundle.findById(id);
};

const updateBundle = async (id, data) => {
  return Bundle.findByIdAndUpdate(id, data, { new: true });
};

const deleteBundle = async (id) => {
  return Bundle.findByIdAndDelete(id);
};

//findTagByIdAndUpdate
const findTagByIdAndUpdate = async (id, data) => {
  return Bundle.findByIdAndUpdate(id, data, { new: true });
};

const getBundlesCount = async (query) => {
  return getModelCounts({ model: Bundle, filterQuery: query });
}

module.exports = {
  createBundle,
  getBundles,
  getBundleById,
  updateBundle,
  deleteBundle,
  findTagByIdAndUpdate,
  getBundlesCount
};