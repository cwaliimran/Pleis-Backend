const GlobalStatusLevels = require("@GlobalStatusLevelsModel");

const getStatusLevels = async (query = {}) => {
  return GlobalStatusLevels.find(query)
    .sort({ entryPoints: 1 }) // ascending: Blue → Black
    .lean();
};

module.exports = {
  getStatusLevels,
};
