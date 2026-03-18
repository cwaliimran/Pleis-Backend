const GlobalStatusLevels = require("@GlobalStatusLevelsModel");

const getStatusLevels = async (query = {}) => {
  return GlobalStatusLevels.find(query)
    .sort({ entryPoints: 1 })
    .lean();
};

module.exports = {
  getStatusLevels,
};
