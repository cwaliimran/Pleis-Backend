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
const getMarketingsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  try {
    // Apply the query to filter by userId and any other filters passed in the query
    const marketingData = await Marketing.find(query)
      .populate("userId", "firstName lastName profileIcon")  // Populate user details (name and profileIcon)

      .sort({ createdAt: -1 })  // Sort by creation date in descending order
      .skip(skip)  // Pagination: skip the results based on the page
      .limit(limit)  // Limit the number of results based on the `limit`
      .lean()  // Return plain JavaScript objects (not Mongoose documents)
      .exec();  // Execute the query

    return marketingData;  // Return the fetched marketing data
  } catch (error) {

    throw new Error("Failed to fetch marketing campaigns");  // Handle error appropriately
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
