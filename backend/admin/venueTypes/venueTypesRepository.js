// repositories/venueTypeRepository.js

const { getWithFilters, getModelCounts } = require('@dbUtils/queryUtil');

const VenueTypesModel = require("./VenueTypesModel");
const { cache, invalidate } = require("@redisCache");
const { default: mongoose } = require('mongoose');
const ACTIVE_VENUE_TYPES_CACHE_KEY = "venueTypes:active";
const buildVenueTypesCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10,
  status,
  date,
  keyword,
  categories,
  sortBy,
  sortOrder,
  categoriesFilter = []
}) => {
  return `${ACTIVE_VENUE_TYPES_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}:status=${status}:date=${date}:keyword=${keyword}:categories=${categories}:sortBy=${sortBy}:sortOrder=${sortOrder}:categoriesFilter=${categoriesFilter}`;

};
// Create
const createVenueType = async (data) => {
  const venuetype = new VenueTypesModel(data);
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return await venuetype.save();
};

// Get all with filters
// const getVenueTypesWithFilters = async (query, page, limit, status, date, keyword, categories, sortBy, sortOrder, categoriesFilter = []) => {
//   if (categoriesFilter.length > 0) {
//     categoriesFilter = categoriesFilter.map(id => new mongoose.Types.ObjectId(id)); // Convert string IDs to ObjectIds
//   }
//   await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
//   const cacheKey = buildVenueTypesCacheKey({
//     scope: "admin",
//     skip: page,
//     limit,
//     status,
//     date,
//     keyword,
//     categories,
//     sortBy,
//     sortOrder,
//     categoriesFilter: categoriesFilter.length > 0 ? categoriesFilter.join(",") : ""
//   });
//   return cache({
//     namespace: cacheKey,
//     ttl: 86400, // 1 day

//     fetchFn: async () => {
//       return getWithFilters({
//         model: VenueTypesModel,
//         query,
//         populate: [
//           {
//             path: "categories",
//             select: "title order",
//             match: { status: "active" },
//           },

//         ],
//         options: { page, limit, sort: { title: 1 } },
//       });

//     },
//   });
// };
const getVenueTypesWithFilters = async (
  query,
  page = 1,
  limit = 20,
  status,
  date,
  keyword,
  categories,
  sortBy = "createdAt",
  sortOrder = "desc",
  categoriesFilter = []
) => {
  if (categoriesFilter.length > 0) {
    categoriesFilter = categoriesFilter.map(id => new mongoose.Types.ObjectId(id));
  }

  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);

  const cacheKey = buildVenueTypesCacheKey({
    scope: "admin",
    skip: page,
    limit,
    status,
    date,
    keyword,
    categories,
    sortBy,
    sortOrder,
    categoriesFilter: categoriesFilter.length > 0 ? categoriesFilter.join(",") : ""
  });

  return cache({
    namespace: cacheKey,
    ttl: 86400,
    fetchFn: async () => {
      const sortDirection = sortOrder === "asc" ? 1 : -1;
      const pipeline = [{ $match: query }];

      // Lookup active categories
      pipeline.push({
        $lookup: {
          from: "categories",
          localField: "categories",
          foreignField: "_id",
          as: "categories",
          pipeline: [
            { $match: { status: "active" } },
            { $project: { _id: 1, title: 1, order: 1 } },
            { $sort: { title: 1 } } // sort categories alphabetically
          ]
        }
      });

      // Add lowercase sort fields
      if (sortBy === "title") {
        pipeline.push({
          $addFields: { sortField: { $toLower: { $ifNull: ["$title", ""] } } }
        });
      } else if (sortBy === "categoryTitle") {
        pipeline.push({
          $addFields: {
            sortField: {
              $toLower: {
                $ifNull: [{ $arrayElemAt: ["$categories.title", 0] }, ""]
              }
            }
          }
        });
      } else if (sortBy === "createdAt") {
        pipeline.push({ $addFields: { sortField: "$createdAt" } });
      }

      // Apply sort, skip, limit
      pipeline.push({ $sort: { sortField: sortDirection, _id: -1 } });
      pipeline.push({ $skip: (page - 1) * limit });
      if (limit > 0) pipeline.push({ $limit: limit });

      // Remove temporary sort field
      pipeline.push({ $project: { sortField: 0 } });

      return VenueTypesModel.aggregate(pipeline).allowDiskUse(true);
    }
  });
};

const getCounts = async (query) => {
  return getModelCounts({ model: VenueTypesModel, filterQuery: query });
}

// Count by condition
const countVenueTypes = async (query = {}) => {
  return VenueTypesModel.countDocuments(query);
};

// Find by ID
const findVenueTypeById = async (id) => {
  return VenueTypesModel.findById(id);
};

// Update and save
const updateVenueTypeData = async (venuetype, data) => {
  Object.assign(venuetype, data);
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return await venuetype.save();
};

// Delete
const deleteVenueTypeById = async (venuetype) => {
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return await venuetype.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_VENUE_TYPES_CACHE_KEY);
  return VenueTypesModel.findByIdAndUpdate(id, data, { new: true });
};

module.exports = {
  createVenueType,
  getVenueTypesWithFilters,
  countVenueTypes,
  findVenueTypeById,
  updateVenueTypeData,
  deleteVenueTypeById,
  findByIdAndUpdate,
  getCounts,
};
