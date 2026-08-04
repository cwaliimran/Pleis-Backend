const mongoose = require("mongoose");
const Occasion = require("@OccasionModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const createOccasion = async (data) => {
  try {
    const OccasionData = new Occasion(data);
    await OccasionData.save();
    return OccasionData;
  } catch (err) {
    throw err;
  }
};

const getOccasion = async ({
  organization,
}) => {
  const query = { organization: new mongoose.Types.ObjectId(organization) };
    query.status = "active";
  const [occasion] = await Promise.all([
    Occasion.find(query)
      .sort({ createdAt: -1 })
      .lean(),
  ]);
  return occasion;
};

const findOccasionById = async (id) => {
  return Occasion.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return Occasion.findByIdAndUpdate(id, data, { new: true });
};
module.exports = {
  createOccasion,
  getOccasion,
  findOccasionById,
  findByIdAndUpdate,
};
