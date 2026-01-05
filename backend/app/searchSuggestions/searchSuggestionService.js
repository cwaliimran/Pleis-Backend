const {
  createOrIncrementGlobal,
  upsertUserSearch,
  cleanupUserHistory,
  fetchUserSearches,
  fetchTrending,
} = require("./searchSuggestionRepository");

const { normalizeKeyword, buildFilterHash } = require("./normalize");

const MAX_USER_RECENTS = 15;

async function recordSearchService({
  userId,
  keyword,
  filters,
  location,
  radiusKm = 50
}) {
  const normalizedKeyword = normalizeKeyword(keyword);
  const filterHash = buildFilterHash(filters);
  const day = new Date().toISOString().slice(0, 10);

  // bucket location - validate coordinates
  const bucketed = location?.coordinates && Array.isArray(location.coordinates) && 
    location.coordinates.length === 2 &&
    !isNaN(location.coordinates[0]) &&
    !isNaN(location.coordinates[1])
      ? [
          Number(location.coordinates[0].toFixed(3)),
          Number(location.coordinates[1].toFixed(3))
        ]
      : null;

  if (!bucketed) {
    console.error("Invalid location coordinates:", location);
    // Optionally, handle this case (e.g., set location to null or a default value)
    return;  // Exit the function without proceeding further
  }

  try {
    // Attempt to record the search globally
    await createOrIncrementGlobal({
      keyword: normalizedKeyword,
      filterHash,
      filters,
      day,
      location: bucketed ? { type: "Point", coordinates: bucketed } : null,
      radiusKm
    });

    if (userId) {
      // If userId is provided, record user's search
      await upsertUserSearch({
        userId,
        keyword: normalizedKeyword,
        filterHash,
        filters,
        location: bucketed ? { type: "Point", coordinates: bucketed } : null,
        radiusKm
      });

      // Clean up user history to avoid too many records
      await cleanupUserHistory(userId, MAX_USER_RECENTS);
    }
  } catch (err) {
    // Specific error handling for MongoDB duplicate key error
    if (err.code === 11000) {
      console.error("Duplicate key error while recording search:", err.message);
    } else {
      // Handle other unexpected errors gracefully
      console.error("An error occurred while recording the search:", err.message);
    }

    // Gracefully handle error and do not crash the app
    // Optionally log the error to an external service or monitoring tool
    // e.g., sendErrorToMonitoringService(err);

    // Do not throw error to avoid app crash, log it and continue
  }
}


async function getUserSearches(userId) {
  return fetchUserSearches(userId);
}

async function getTrendingSearchesService({ days = 3, limit = 10, center, radiusKm = 50 }) {
   const from = new Date(Date.now() - days * 86400000)
    .toISOString()
    .slice(0, 10);

  const result = await fetchTrending({
    from,
    limit,
    center,
    radiusKm,
  });

  // Always return a single object
  return result?.[0] || {
    keywords: [],
    categories: [],
    venueTypes: [],
    tags: [],
    genre: []
  };
}

module.exports = {
  recordSearchService,
  getUserSearches,
  getTrendingSearchesService,
};
