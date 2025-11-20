const { getModelCounts } = require("@dbUtils/queryUtil");
const { default: mongoose } = require("mongoose");
const { TicketingOrders } = require("@TicketingOrdersModel");



const getTransactionsRepo = async (query = {}, options = {}) => {
  return TicketingOrders.aggregate([
    { $match: query },

    // Populate Event
    {
      $lookup: {
        from: "events",
        localField: "event",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.title": 1,
              "basicInfo.media": 1,
              "basicInfo.venueLocation": 1,
              schedule: 1
            }
          }
        ],
        as: "event"
      }
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },

    // Populate Organization
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
              "basicInfo.media": 1
            }
          }
        ],
        as: "organization"
      }
    },
    { $unwind: { path: "$organization", preserveNullAndEmptyArrays: true } },

    // OPTIONAL: Populate User (if needed)
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              profilePic: 1
            }
          }
        ],
        as: "user"
      }
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

    // Populate reservation (if purpose = reservation)
    {
      $lookup: {
        from: "reservations",
        localField: "reservation",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              tableNumber: 1,
              guests: 1,
              date: 1,
              time: 1
            }
          }
        ],
        as: "reservation"
      }
    },
    { $unwind: { path: "$reservation", preserveNullAndEmptyArrays: true } },

    { $sort: options.sort || { createdAt: -1 } },
    { $skip: options.skip || 0 },
    { $limit: options.limit || 10 }
  ]);
};

const getCounts = async (query, statusMap) => {
  return getModelCounts({ model: TicketingOrders, filterQuery: query, statusMap });
};


module.exports = {
  getTransactionsRepo,
  getCounts,
};