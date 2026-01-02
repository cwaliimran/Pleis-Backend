const SearchSuggestion = require("./SearchSuggestion");

const createOrIncrementGlobal = async (filter) => {
  return SearchSuggestion.updateOne(
    {
      docType: "global",
      keyword: filter.keyword,
      filterHash: filter.filterHash,
      day: filter.day,
      location: filter.location || null
    },
    {
      $inc: { count: 1 },
      $set: {
        filters: filter.filters,
        radiusKm: filter.radiusKm,
        lastSearchedAt: new Date(),
      },
    },
    { upsert: true }
  );
};


const upsertUserSearch = async (filter) => {
  return SearchSuggestion.updateOne(
    {
      docType: "user",
      user: filter.userId,
      filterHash: filter.filterHash
    },
    {
      $set: {
        keyword: filter.keyword,
        filters: filter.filters,
        location: filter.location || null,
        radiusKm: filter.radiusKm,
        lastUsedAt: new Date(),
      },
    },
    { upsert: true }
  );
};


const cleanupUserHistory = async (userId, limit) => {
  const extra = await SearchSuggestion.find({
    docType: "user",
    user: userId,
  })
    .sort({ lastUsedAt: -1 })
    .skip(limit)
    .select("_id");

  if (extra.length) {
    await SearchSuggestion.deleteMany({ _id: { $in: extra.map(x => x._id) } });
  }
};

const fetchUserSearches = async (userId) => {
  return SearchSuggestion.find({
    docType: "user",
    user: userId,
  })
    .sort({ lastUsedAt: -1 })
    .select("keyword filters lastUsedAt -_id");
};

const fetchTrending = async ({ from, limit, center, radiusKm }) => {
  return SearchSuggestion.aggregate([
    {
      $match: {
        docType: "global",
        day: { $gte: from },
        keyword: { $nin: ["", null] },
        location: {
          $geoWithin: {
            $centerSphere: [center.coordinates, radiusKm / 6378.1]
          }
        }
      }
    },

    {
      $group: {
        _id: { keyword: "$keyword", filterHash: "$filterHash" },
        keyword: { $first: "$keyword" },
        filters: { $first: "$filters" },
        total: { $sum: "$count" }
      }
    },

    { $sort: { total: -1 } },

    { $limit: limit },

    {
      $project: {
        keyword: 1,
        total: 1,
        categories: "$filters.categories",
        venueTypes: "$filters.venueTypes",
        tags: "$filters.tags",
        genre: "$filters.genre"
      }
    },

    { $unwind: { path: "$categories", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$venueTypes", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$tags", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$genre", preserveNullAndEmptyArrays: true } },

    {
      $group: {
        _id: null,
        keywords: { $push: "$keyword" },
        total: { $sum: "$total" },

        categories: { $addToSet: "$categories" },
        venueTypes: { $addToSet: "$venueTypes" },
        tags: { $addToSet: "$tags" },
        genre: { $addToSet: "$genre" }
      }
    },

    {
      $project: {
        _id: 0,
        total: 1,
        keywords: { $slice: ["$keywords", 5] },
        categories: { $slice: [{ $setUnion: ["$categories", []] }, 5] },
        venueTypes: { $slice: [{ $setUnion: ["$venueTypes", []] }, 5] },
        tags: { $slice: [{ $setUnion: ["$tags", []] }, 5] },
        genre: { $slice: [{ $setUnion: ["$genre", []] }, 5] }
      }
    }
  ]);
};



module.exports = {
  createOrIncrementGlobal,
  upsertUserSearch,
  cleanupUserHistory,
  fetchUserSearches,
  fetchTrending,
};
