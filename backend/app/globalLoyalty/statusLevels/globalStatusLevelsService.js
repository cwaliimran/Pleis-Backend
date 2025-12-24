const { statusLevelsFormatter } = require("./formatters/statusLevelsFormatter");
const statusLevelRepo = require("./globalStatusLevelsRepository");

const getStatusLevels = async () => {
  // No filters applied
  const query = { status: { $ne: "deleted" } };

  // Fetch via repository
  let statusLevels = await statusLevelRepo.getStatusLevels(query);

  // Format output
  statusLevels = statusLevels.map(item =>
    statusLevelsFormatter(item)
  );

  return {
    statusLevels
  };
};

module.exports = {
  getStatusLevels,
};
