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
const getMarketingsWithFilters = async (
  query = {},
  skip = 0,
  limit = 10,
  sortBy = "createdAt",
  sortOrder = "desc"
) => {
  try {
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const pipeline = [
      { $match: query },

      // Lookup user
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
          pipeline: [
            { $project: { firstName: 1, lastName: 1, profileIcon: 1 } }
          ]
        }
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } }
    ];

    // Add a lowercase sort field for userName
    if (sortBy === "userName") {
      pipeline.push({
        $addFields: {
          userNameSort: {
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
      pipeline.push({ $sort: { userNameSort: sortDirection, _id: -1 } });
    } else if (sortBy === "title") {
      pipeline.push({
        $addFields: { titleSort: { $toLower: { $ifNull: ["$title", ""] } } }
      });
      pipeline.push({ $sort: { titleSort: sortDirection, _id: -1 } });
    } else {
      pipeline.push({ $sort: { createdAt: sortDirection, _id: sortDirection } });
    }

    // Pagination
    pipeline.push({ $skip: skip });
    if (limit > 0) pipeline.push({ $limit: limit });

    // Remove temporary sort fields
    pipeline.push({ $project: { userNameSort: 0, titleSort: 0 } });

    const marketingData = await Marketing.aggregate(pipeline).allowDiskUse(true);

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
