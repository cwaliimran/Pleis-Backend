// services/highlightService.js

const highlightRepo = require("./highlightRepository");
const { formatPublicHighlightResponse } = require("../../commonModules/highlights/formatters/formatPublicHighlightResponse");

const getPublicHighlights = async ({ userId, page, limit, keyword, userLocation }) => {
  const query = { status: "active" };

  const skip = limit === 0 ? 0 : (page - 1) * limit;


  let [highlights] = await Promise.all([
    highlightRepo.getPublicHighlightsWithFilters(
      userId,
      query,
      keyword,
      skip,
      limit === 0 ? 0 : limit
    ),
  ]);

  highlights = highlights?.map((highlight) => {
    return formatPublicHighlightResponse(highlight, { userLocation });
  });

  return {
    highlights
  };
};

module.exports = {
  getPublicHighlights,
};
