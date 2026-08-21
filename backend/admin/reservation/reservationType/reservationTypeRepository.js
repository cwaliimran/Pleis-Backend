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
  } else {
    query.status = { $ne: "deleted" };
  }
  if (conditionType) {
    query.conditionType = conditionType;
  }

  const [ReservationTypes, totalFiltered, totalMaxCapacity] = await Promise.all(
    [
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
    ],
  );
  let meta = generateMeta(page, limit, totalFiltered);
  meta.totalMaxCapacity = totalMaxCapacity[0]?.totalMaxCapacity || 0;
  return { ReservationTypes, meta };
};
const getReservationTypesSummary = async ({
  page,
  limit,
  organization,
  skip,
}) => {
  const pipeline = [
    {
      $match: {
        organization: new mongoose.Types.ObjectId(organization),
        status: "active",
      },
    },
    {
      $lookup: {
        from: "userreservations",
        let: {
          reservationTypeId: { $toString: "$_id" },
          organizationId: new mongoose.Types.ObjectId(organization),
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$reservationType", "$$reservationTypeId"],
                  },
                  {
                    $eq: ["$organizationId", "$$organizationId"],
                  },
                  {
                    $not: {
                      $in: ["$status", ["cancelled", "deleted"]],
                    },
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalReservations: { $sum: 1 },
              usedTables: { $sum: "$numberOfTables" },
              usedPartySize: { $sum: "$partySize" },
            },
          },
        ],
        as: "reservationStats",
      },
    },
    {
      $unwind: {
        path: "$reservationStats",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        name: 1,
        maxPartySize: 1,
        conditionType: 1,
        occasionRequired: 1,

        availableTables: {
          $subtract: [
            { $ifNull: ["$numberOfTables", 0] },
            { $ifNull: ["$reservationStats.usedTables", 0] },
          ],
        },

        availableCapacity: {
          $subtract: [
            { $ifNull: ["$maxCapacity", 0] },
            { $ifNull: ["$reservationStats.usedPartySize", 0] },
          ],
        },
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [
          {
            $count: "count",
          },
        ],
      },
    },
  ];

  const [result] = await ReservationType.aggregate(pipeline);

  const ReservationTypes = result.data;
  const totalFiltered = result.total[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  return {
    ReservationTypes,
    meta,
  };
};

const findReservationTypeById = async (id) => {
  return ReservationType.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return ReservationType.findByIdAndUpdate(id, data, { new: true });
};
const checkReservationCapacity = async ({ reservationTypeId }) => {
  const reservationType = await ReservationType.findById(reservationTypeId).select("maxCapacity");
  if (!reservationType) {
    return 0
  }

  return reservationType.maxCapacity;
};

module.exports = {
  createReservationType,
  getReservationTypes,
  findReservationTypeById,
  findByIdAndUpdate,
  getReservationTypesSummary,
  checkReservationCapacity,
};
