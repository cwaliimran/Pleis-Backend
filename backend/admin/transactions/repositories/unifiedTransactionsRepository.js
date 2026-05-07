// repositories/unifiedTransactionsRepository.js
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel"); // new model
const { updateUserCompanyPointsRepo, checkLoyaltyTierPromotion, checkDemotion } = require("../../../app/loyalty/clubMembers/clubMembersRepository");
const { updateGlobalPoints, checkPromotionGlobal } = require("../../../app/userWalletService/global/walletManagement/userWalletRepository");
const { TicketingBookings } = require("@TicketingBookingsModel");

const mongoose = require("mongoose");

const { nanoid } = require("nanoid");
const { TicketingOrders } = require("@TicketingOrdersModel");

const Orders = require("@OrdersModel");
const { LoyaltyChallengesOrders } = require("@LoyaltyChallengesOrdersModel");
const { RewardsOrders } = require("@LoyaltyRewardsOrdersModel");
const { UserReservations } = require("@UserReservationsModel");
const { PromotionsOrders } = require("../../../commonModules/loyalty/promotions/models/Promotion");
const WebhookTransactionsEventModel = require("../../../commonModules/paymentsIntegrations/paymentsWebhook/repositories/WebhookTransactionsEvent.model");
let batchId = null;

const buildKeywordMatch = (keyword) => {
  if (!keyword?.trim()) return null;

  const regex = new RegExp(keyword, "i");

  return {
    $or: [
      // Transaction
      { description: regex },
      { batchId: regex },
      { publicId: regex },
      { domainType: regex },
      { walletType: regex },
      { type: regex },

      // User
      { "user.firstName": regex },
      { "user.lastName": regex },
      { "user.email": regex },

      // Organizer
      { "companyOrganizer.firstName": regex },
      { "companyOrganizer.lastName": regex },
      { "companyOrganizer.companyDetails.loyaltySettings.title": regex },

      // Organization
      { "organization.basicInfo.name": regex }
    ]
  };
};

const getTransactionsWithFilters = async ({
  match = {},
  keyword,
  skip = 0,
  limit = 10,
  referral

}) => {

  /* =====================================================
     🔵 CASE A — NO KEYWORD (FAST TWO-STAGE)
  ===================================================== */

  if (!keyword?.trim()) {

    const idPipeline = [];

    if (Object.keys(match).length) {
      idPipeline.push({ $match: match });
    }

    idPipeline.push(
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: skip }
    );

    if (limit > 0) {
      idPipeline.push({ $limit: limit });
    }

    idPipeline.push({ $project: { _id: 1 } });

    const ids = await UnifiedWalletTransactions.aggregate(idPipeline);
    if (!ids.length) return [];

    const txIds = ids.map(i => i._id);

    const pipeline = [
      { $match: { _id: { $in: txIds } } },
      {
        $addFields: {
          __order: { $indexOfArray: [txIds, "$_id"] }
        }
      },

      // Lookups
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "companyOrganizer",
          foreignField: "_id",
          as: "companyOrganizer"
        }
      },
      {
        $lookup: {
          from: "organizations",
          localField: "organization",
          foreignField: "_id",
          as: "organization"
        }
      },
      {
        $addFields: {
          user: { $arrayElemAt: ["$user", 0] },
          companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] },
          organization: { $arrayElemAt: ["$organization", 0] }
        }
      },

      {
        $project: {
          batchId: 1,
          walletType: 1,
          type: 1,
          domainType: 1,
          entityId: 1,
          points: 1,
          closingBalance: 1,
          description: 1,
          publicId: 1,
          createdAt: 1,
          updatedAt: 1,
          __order: 1,

          user: {
            _id: "$user._id",
            firstName: "$user.firstName",
            lastName: "$user.lastName",
            email: "$user.email",
            profileIcon: "$user.profileIcon"
          },

          companyOrganizer: {
            _id: "$companyOrganizer._id",
            logo: "$companyOrganizer.companyDetails.logo",
            title: "$companyOrganizer.companyDetails.loyaltySettings.title",
            status: "$companyOrganizer.companyDetails.status"
          },

          organization: {
            _id: "$organization._id",
            basicInfo: {
              name: "$organization.basicInfo.name",
              media: {
                logo: "$organization.basicInfo.media.logo"
              }
            }
          }
        }
      },

      { $sort: { __order: 1 } }
    ];

    const txList = await UnifiedWalletTransactions.aggregate(pipeline, {
      allowDiskUse: true
    });
const result = await attachBookings(txList);
    return result;
  }

  /* =====================================================
     🔎 CASE B — KEYWORD SEARCH (LOOKUP FIRST)
  ===================================================== */

  const regexMatch = buildKeywordMatch(keyword);
  const pipeline = [];

  if (Object.keys(match).length) {
    pipeline.push({ $match: match });
  }



  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organization"
      }
    },
    {
      $addFields: {
        user: { $arrayElemAt: ["$user", 0] },
        companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] },
        organization: { $arrayElemAt: ["$organization", 0] }
      }
    },
    { $match: regexMatch },
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: skip }
  );

  if (limit > 0) {
    pipeline.push({ $limit: limit });
  }

  pipeline.push({
    $project: {
      batchId: 1,
      walletType: 1,
      type: 1,
      domainType: 1,
      entityId: 1,
      points: 1,
      closingBalance: 1,
      description: 1,
      publicId: 1,
      createdAt: 1,
      updatedAt: 1,

      user: {
        _id: "$user._id",
        firstName: "$user.firstName",
        lastName: "$user.lastName",
        email: "$user.email",
        profileIcon: "$user.profileIcon"
      },

      companyOrganizer: {
        _id: "$companyOrganizer._id",
        logo: "$companyOrganizer.companyDetails.logo",
        title: "$companyOrganizer.companyDetails.loyaltySettings.title"
      },

      organization: {
        _id: "$organization._id",
        basicInfo: {
          name: "$organization.basicInfo.name",
          media: {
            logo: "$organization.basicInfo.media.logo"
          }
        }
      }
    }
  });

  const txList = await UnifiedWalletTransactions.aggregate(pipeline, {
    allowDiskUse: true
  });

  return await attachBookings(txList);
};

const attachBookings = async (txList) => {
  // Define domain types
  const domainTypes = [
    "ticketingorders", "menuorders", "ticketingbookings", "loyaltyrewardsorders",
    "loyaltychallengesorders", "globalrewardsorders", "userreservations", "promotionorders"
  ];

  // Filter and group entityIds by domain type
  const domainQueries = domainTypes.reduce((acc, domain) => {
    const entityIds = txList
      .filter(t => t.domainType === domain && t.entityId)  // Ensure entityId exists
      .map(t => new mongoose.Types.ObjectId(t.entityId));
    if (entityIds.length) acc[domain] = entityIds;
    return acc;
  }, {});

  // If no domain has entityIds, return the original list with empty bookings
  if (Object.keys(domainQueries).length === 0) {
    return txList.map(tx => ({ ...tx, bookings: [] }));
  }

  // Perform lookup for each domain type dynamically
  const bookingsResult = await Promise.all(
    Object.entries(domainQueries).map(async ([domain, entityIds]) => {
      const bookings = await getBookingsForDomain(domain, entityIds);
      return { domain, bookings };
    })
  );

  // Create a mapping of bookings by domain and orderId
  const bookingMap = bookingsResult.reduce((map, { domain, bookings }) => {
    map[domain] = bookings.reduce((orderMap, booking) => {
      const oid = booking._id.toString();
      if (!orderMap[oid]) orderMap[oid] = [];
      orderMap[oid].push(booking);
      return orderMap;
    }, {});
    return map;
  }, {});

  // Map bookings to each transaction based on domain type
  return txList.map(tx => {
    const domain = tx.domainType;
    const bookings = bookingMap[domain] || {};

    // Log the entityId to check if it's missing
    if (!tx.entityId) {
      console.log(`Skipping transaction due to missing entityId:`, tx);
      return { ...tx, bookings: [] };  // Skip if entityId is missing
    }

    // Ensure entityId is valid before using .toString()
    const entityIdStr = tx.entityId ? tx.entityId.toString() : null;
    
    // Return the updated transaction with the bookings
    return {
      ...tx,
      bookings: bookings[entityIdStr] || []  // Assign bookings if available
    };
  });
};

// Helper function to fetch bookings for each domain
const getBookingsForDomain = async (domain, orderIds) => {
  try {
    
    let bookings = [];
    switch (domain) {
      case "ticketingorders":
        bookings = await TicketingOrders.find({ _id: { $in: orderIds } }).lean();
        break;
      case "menuorders":
        bookings = await Orders.find({ _id: { $in: orderIds } }).lean();
        break;
      case "ticketingbookings":
        bookings = await TicketingBookings.find({ _id: { $in: orderIds } }).lean();
        break;
      case "loyaltyrewardsorders":
        bookings = await RewardsOrders.find({ _id: { $in: orderIds } }).lean();
        break;
      case "loyaltychallengesorders":
        bookings = await LoyaltyChallengesOrders.find({ _id: { $in: orderIds } }).lean();
        break;
      case "userreservations":
        bookings = await UserReservations.find({ _id: { $in: orderIds } }).lean();
        break;
      case "promotionorders":
        bookings = await PromotionsOrders.find({ _id: { $in: orderIds } }).lean();
        break;
      default:
        bookings = [];
    }

    return bookings;
  } catch (error) {
    return [];
  }
};

const countTransactions = async ({ match = {}, keyword }) => {

  if (!keyword?.trim()) {
    return UnifiedWalletTransactions.countDocuments(match);
  }

  const regexMatch = buildKeywordMatch(keyword);
  const pipeline = [];

  if (Object.keys(match).length) {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organization"
      }
    },
    {
      $addFields: {
        user: { $arrayElemAt: ["$user", 0] },
        companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] },
        organization: { $arrayElemAt: ["$organization", 0] }
      }
    },
    { $match: regexMatch },
    { $count: "total" }
  );

  const res = await UnifiedWalletTransactions.aggregate(pipeline, {
    allowDiskUse: true
  });

  return res[0]?.total || 0;
};



const findTransactionById = (id) => {
  return UnifiedWalletTransactions.findById(id)
    .populate({ path: "user", select: "firstName lastName email profileIcon" })
    .populate({ path: "companyOrganizer", select: "firstName lastName profileIcon" })
    .populate({ path: "organization", select: "basicInfo.name" });
};

const updateTransactionData = async (transactionDoc, data) => {
  Object.assign(transactionDoc, data);
  return await transactionDoc.save();
};

const findByIdAndUpdate = async (id, data) => {
  return UnifiedWalletTransactions.findByIdAndUpdate(id, data, { new: true });
};

const deleteTransactionById = async (transactionDoc) => {
  return await transactionDoc.deleteOne();
};

const findTransactionsByUserId = async (userId) => {
  return UnifiedWalletTransactions.find({ user: userId }).sort({ createdAt: -1 });
};

const getTotalClosingBalanceByOrganizationId = async (organizationId) => {
  try {
    const objectId = new mongoose.Types.ObjectId(organizationId);
    const result = await WebhookTransactionsEventModel.aggregate([
      { $match: { organization: objectId } },
      { $project: { amount: { $toDouble: "$amount" } } }, 
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } }
    ]);
  
    return result.length > 0 ? result[0].totalAmount : 0;
  } catch (error) {
    console.error("Error fetching total closing balance:", error);
    return 0;
  }
};

module.exports = {
  getTransactionsWithFilters,
  countTransactions,
  findTransactionById,
  updateTransactionData,
  findByIdAndUpdate,
  deleteTransactionById,
  findTransactionsByUserId,
  getTotalClosingBalanceByOrganizationId,
};
