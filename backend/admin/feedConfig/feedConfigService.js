const feedConfigRepository = require("./feedConfigRepository");

const getFeedConfig = async () => {
  return feedConfigRepository.findOrCreateFeedConfig();
};

const updateFeedConfig = async ({ quickAction }) => {
  return feedConfigRepository.updateFeedConfig({ quickAction });
};

module.exports = {
  getFeedConfig,
  updateFeedConfig,
};