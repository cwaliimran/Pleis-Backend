// services/highlightService.js

const highlightRepo = require("./highlightRepository");
const { formatHighlightsResponse } = require("./formatters/formatHighlightsResponse");

const getPublicHighlights = async ({ userId, page, limit, keyword, userLocation,radiusKm, category,time, timezone }) => {
  const query = { status: "active" };

  const skip = limit === 0 ? 0 : (page - 1) * limit;


  let [highlights] = await Promise.all([
    highlightRepo.getPublicHighlightsWithFilters(
      userId,
      query,
      keyword,
      userLocation,
      radiusKm,
      skip,
      limit === 0 ? 0 : limit,
      category,
      time,
      timezone
    ),
  ]);

  
  highlights = highlights?.map((highlight) => {
    return formatHighlightsResponse(highlight, { userLocation });
  });

  return {
    highlights
  };
};

module.exports = {
  getPublicHighlights,
};
