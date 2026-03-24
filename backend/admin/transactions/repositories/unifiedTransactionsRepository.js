// repositories/unifiedTransactionsRepository.js
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel"); // new model
const { updateUserCompanyPointsRepo, checkLoyaltyTierPromotion, checkDemotion } = require("../../../app/loyalty/clubMembers/clubMembersRepository");
const { updateGlobalPoints, checkPromotionGlobal } = require("../../../app/userWalletService/global/walletManagement/userWalletRepository");
const { TicketingBookings } = require("@TicketingBookingsModel");

const mongoose = require("mongoose");

const { nanoid } = require("nanoid");
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
  limit = 10
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
      },

      { $sort: { __order: 1 } }
    ];

    const txList = await UnifiedWalletTransactions.aggregate(pipeline, {
      allowDiskUse: true
    });

    return await attachBookings(txList);
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

  const orderIds = txList
    .filter(t => t.domainType === "ticketingorders" && t.entityId)
    .map(t => new mongoose.Types.ObjectId(t.entityId));

  if (!orderIds.length) {
    return txList.map(tx => ({ ...tx, ticketingBookings: [] }));
  }

  const bookings = await TicketingBookings.find({
    order: { $in: orderIds }
  }).lean();

  const bookingMap = {};

  for (const bk of bookings) {
    const oid = bk.order.toString();
    if (!bookingMap[oid]) bookingMap[oid] = [];
    bookingMap[oid].push(bk);
  }

  return txList.map(tx => ({
    ...tx,
    ticketingBookings:
      tx.domainType === "ticketingorders"
        ? bookingMap[tx.entityId?.toString()] || []
        : []
  }));
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
    const result = await UnifiedWalletTransactions.aggregate([
      { $match: { organization: objectId } },
      { $group: { _id: null, totalClosingBalance: { $sum: "$closingBalance" } } }
    ]);
    return result.length > 0 ? result[0].totalClosingBalance : 0;
  } catch (error) {

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
