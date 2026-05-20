const
  Marketing
    = require("@Marketing");

// Decide which discriminator model to use
const getModelByTaskType = () => {

  return Marketing; // fallback
}

// Create Marketing
const createMarketing = async (data) => {
  try {

    const Model = getModelByTaskType();
    const Marketing = new Model(data);
    await Marketing.save();
    return Marketing;
  } catch (err) {
    throw err;
  }
};

// Get Marketings with population
const getMarketingsWithFilters = async (query = {}, skip = 0, limit = 10, sortBy = "createdAt", sortOrder = "desc") => {
  try {
   
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    // Build aggregation pipeline
    const pipeline = [
      { $match: query },

      // Lookup user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          pipeline: [
            { $project: { firstName: 1, lastName: 1, profileIcon: 1 } }
          ],
          as: "user"
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } }
    ];

    // Add lowercase sorting field for userName or title
    if (sortBy === "userName") {
      pipeline.push({
        $addFields: {
          sortField: {
            $toLower: {
              $concat: [
                { $ifNull: ["$user.firstName", ""] },
                " ",
                { $ifNull: ["$user.lastName", ""] }
              ]
            }
          }
        }
      });
    } else if (sortBy === "title") {
      pipeline.push({
        $addFields: {
          sortField: { $toLower: { $ifNull: ["$title", ""] } }
        }
      });
    } else {
      pipeline.push({ $addFields: { sortField: "$createdAt" } });
    }

    // Sort and apply pagination
    pipeline.push({ $sort: { sortField: sortDirection, _id: -1 } });
    pipeline.push({ $skip: skip });
    if (limit > 0) pipeline.push({ $limit: limit });

    // Execute aggregation
    const marketingData = await Marketing.aggregate(pipeline);

    return marketingData;
  } catch (error) {
    throw new Error("Failed to fetch marketing campaigns");
  }
};

// Count
const countMarketings = async (query = {}) => {
  return Marketing.countDocuments(query);
};

// Find by ID with population
const findMarketingById = async (id) => {
  return Marketing.findById(id)
};

// Update and save
const updateMarketingData = async (Marketing, data) => {
  Object.assign(Marketing, data);
  return await Marketing.save();
};

// Delete
const deleteMarketingById = async (Marketing) => {
  return await Marketing.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return Marketing.findByIdAndUpdate(id, data, { new: true })
};

module.exports = {
  createMarketing,
  getMarketingsWithFilters,
  countMarketings,
  findMarketingById,
  updateMarketingData,
  deleteMarketingById,
  findByIdAndUpdate,
};
