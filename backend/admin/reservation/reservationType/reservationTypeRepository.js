const mongoose = require("mongoose");
const ReservationType = require("@ReservationTypeModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");

const createReservationType = async (data) => {
  try {
    const ReservationTypeData = new ReservationType(data);
    await ReservationTypeData.save();
    return ReservationTypeData;
  } catch (err) {
    throw err;
  }
};

const getReservationTypes = async ({
  timezone,
  page,
  limit,
  status,
  organization,
  conditionType,
  skip,
}) => {
  const query = { organization: new mongoose.Types.ObjectId(organization) };
  if (status) {
    query.status = status;
  }
  else {
    query.status = { $ne: "deleted" };
  }
  if (conditionType) {
    query.conditionType = conditionType;
  }


  const [ReservationTypes, totalFiltered, totalMaxCapacity] = await Promise.all([
    ReservationType.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ReservationType.countDocuments(query),
    ReservationType.aggregate([
      { $match: query },
      { $group: { _id: null, totalMaxCapacity: { $sum: "$maxCapacity" } } },
    ]),
  ]);
  let meta = generateMeta(page, limit, totalFiltered);
  meta.totalMaxCapacity = totalMaxCapacity[0]?.totalMaxCapacity || 0;
  return { ReservationTypes, meta };
};
const getReservationTypesSummary = async ({
  timezone,
  page,
  limit,
  organization,
  skip,
}) => {
  const query = { organization: new mongoose.Types.ObjectId(organization),status: "active" };
    const [ReservationTypes, totalFiltered] = await Promise.all([
    ReservationType.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .select("name"),
    ReservationType.countDocuments(query),
  ]);
  let meta = generateMeta(page, limit, totalFiltered);
  return { ReservationTypes, meta };
};

const findReservationTypeById = async (id) => {
  return ReservationType.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return ReservationType.findByIdAndUpdate(id, data, { new: true });
};
module.exports = {
  createReservationType,
  getReservationTypes,
  findReservationTypeById,
  findByIdAndUpdate,
  getReservationTypesSummary,
};
