const Setttings = require("./Setting");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_Setttings_CACHE_KEY = "Setttings:active";

const getSetttings = async ({ organization }) => {
  const SetttingsData = await Setttings.findOne({
    organization: new mongoose.Types.ObjectId(organization)
  }).lean();

  return SetttingsData || {};
};
const getSetttingsSummary = async ({
  timezone,
  page,
  limit,
  user,
  skip,
}) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $project: {
      _id: 1,
      name: 1,
      code: 1,
    },
  });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Setttings.aggregate(pipeline);

  let Setttings = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    Setttings.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    Setttings.countDocuments({
      status: "active",
      ...(user && { user: user }),
    }),
    Setttings.countDocuments({
      status: "inactive",
      ...(user && { user: user }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.SetttingsCount = { total, active, inactive };

  return { Setttings, meta };
};

const findSetttingsById = async (organization) => {
  return Setttings.findOne({ organization: new mongoose.Types.ObjectId(organization) });
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_Setttings_CACHE_KEY);
  return Setttings.findByIdAndUpdate(id, data, { new: true });
};


const createSetttings = async (data) => {
  const newSetttings = new Setttings(data);
  await newSetttings.save();
  return newSetttings;
};
module.exports = {
  getSetttings,
  findSetttingsById,
  findByIdAndUpdate,
  getSetttingsSummary,
  createSetttings,
};
