const { getModelCounts, buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { default: mongoose } = require("mongoose");
const { TicketingOrders } = require("@TicketingOrdersModel");

const { getOrganizationIdsByCompanyOrganizer } = require("../organizations/organizationRepository");
const Organizations = require("@OrganizationModel");
const { Events } = require("@EventsModel");
const { User } = require("@UserModel");
const { generateMeta } = require("../../helperUtils/responseUtil");
const { getTicketsByOrderIds } = require("../ticketing/ticketingsRepository");



const getTransactionsRepo = async ({
  page,
  limit,
  keyword,
  status,
  date,
  organizations,
  companyOrganizer
}) => {

  let organizationIds = [];

  // 1️⃣ If organizations explicitly provided, use them
  if (Array.isArray(organizations) && organizations.length > 0) {
    organizationIds = organizations.map(id => new mongoose.Types.ObjectId(id));

    // 2️⃣ If companyOrganizer provided → fetch its orgs
  } else if (companyOrganizer) {
    organizationIds = await getOrganizationIdsByCompanyOrganizer(companyOrganizer);

    if (organizationIds.length === 0) {
      return {
        transactions: [],
        meta: generateMeta(page, limit, 0, { total: 0, pending: 0, confirmed: 0, cancelled: 0, completed: 0 })
      };
    }
  }

  // 3️⃣ Pagination setup
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // Populate organization first
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organizationData",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
              "basicInfo.media": 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$organizationData", preserveNullAndEmptyArrays: true } },
  ];

  // 4️⃣ Apply Filters (Exact same ordering as Menus)

  if (organizationIds.length > 0) {
    pipeline.push({
      $match: {
        organization: { $in: organizationIds }
      }
    });
  }

  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    pipeline.push({
      $match: { createdAt: { $gte: start, $lt: end } }
    });
  }

  // 5️⃣ Keyword search (same as Menus)
  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: TicketingOrders.schema },
      { schema: Organizations.schema, prefix: "organizationData." },
      { schema: Events.schema, prefix: "event." },
      { schema: User.schema, prefix: "user." }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length > 0) {
    pipeline.push({ $match: keywordMatch });
  }

  // 6️⃣ Populate Event
  pipeline.push(
    {
      $lookup: {
        from: "events",
        localField: "event",
        foreignField: "_id",
        as: "event",
        pipeline: [
          {
            $project: {
              _id: 1,
              "basicInfo.title": 1,
              "basicInfo.media": 1,
              "basicInfo.venueLocation": 1,
              schedule: 1,
            }
          }
        ]
      }
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } }
  );

  // 7️⃣ Populate User
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
        pipeline: [
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
              // profileIcon: 1
            }
          }
        ]
      }
    },
    { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } }
  );

  // 8️⃣ Populate Reservation
  pipeline.push(
    {
      $lookup: {
        from: "reservations",
        localField: "reservation",
        foreignField: "_id",
        as: "reservation",
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
        ]
      }
    },
    { $unwind: { path: "$reservation", preserveNullAndEmptyArrays: true } }
  );

  // 9️⃣ Final merge + cleanup (same as Menus)
  pipeline.push(
    { $sort: { createdAt: -1 } },
    { $addFields: { organization: "$organizationData" } },
    { $project: { organizationData: 0 } }
  );

  // 🔟 Pagination + Filtered Count
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await TicketingOrders.aggregate(pipeline);
  const transactions = result[0]?.data || [];
  const orderIds = transactions.map(t => t._id); // TicketingOrders _id

  const ticketsMap = await getTicketsByOrderIds(orderIds);

  const transactionsWithTickets = transactions.map(t => ({
    ...t,
    tickets: ticketsMap[t._id.toString()] || []
  }));



  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // 1️⃣Meta counts (pending, confirmed, completed, cancelled)
  const baseFilter =
    organizationIds.length > 0
      ? { organization: { $in: organizationIds } }
      : {};

  const [counts] = await Promise.all([
    getModelCounts({
      model: TicketingOrders,
      filterQuery: baseFilter,
      statusMap: { status: ["pending", "confirmed", "completed", "cancelled"] },

    })
  ]);

  let { total, pending, confirmed, completed, cancelled } = counts
  const meta = generateMeta(page, limit, totalFiltered);
  meta.transactionsCount = { total, pending, confirmed, cancelled, completed };

  return {
    transactions: transactionsWithTickets,
    meta
  };
};



const getCounts = async (query, statusMap) => {
  return getModelCounts({ model: TicketingOrders, filterQuery: query, statusMap });
};


module.exports = {
  getTransactionsRepo,
  getCounts,
};