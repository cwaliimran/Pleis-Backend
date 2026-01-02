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

  // bucket location
  const bucketed = location?.coordinates
    ? [
        Number(location.coordinates[0].toFixed(3)),
        Number(location.coordinates[1].toFixed(3))
      ]
    : null;

  try {
    await createOrIncrementGlobal({
      keyword: normalizedKeyword,
      filterHash,
      filters,
      day,
      location: bucketed ? { type: "Point", coordinates: bucketed } : null,
      radiusKm
    });

    if (userId) {
      await upsertUserSearch({
        userId,
        keyword: normalizedKeyword,
        filterHash,
        filters,
        location: bucketed ? { type: "Point", coordinates: bucketed } : null,
        radiusKm
      });

      await cleanupUserHistory(userId, MAX_USER_RECENTS);
    }
  } catch (err) {
    throw err;
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
