const { User } = require("@UserModel");
const { Events } = require("@EventsModel");
const { TicketingOrders } = require("@TicketingOrdersModel");
const { getDateRanges } = require("./utils/dashboardDate.utils");
const { UserInterests } = require("@UserInterests");
const SearchSuggestion = require("@SearchSuggestionModel");
const { UnifiedWalletTransactions } = require("@UnifiedWalletTransactionsModel");
const mongoose = require("mongoose");

const { ClubMembers } = require("@ClubMembersModel");


const getDashboardStats = async ({ companyOrganizer, dateRanges }) => {
  const baseMatch = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
    ...(dateRanges && {
      createdAt: {
        $gte: dateRanges.start,
        $lte: dateRanges.end,
      },
    }),
  };

  const pipeline = [
    { $match: baseMatch },
    {
      $facet: {
        totalMembers: [{ $count: "count" }],

        activeMembers: [
          { $match: { status: "active" } },
          { $count: "count" },
        ],

        leftMembers: [
          { $match: { status: "left" } },
          { $count: "count" },
        ],
      },
    },
  ];

  const [result = {}] = await ClubMembers.aggregate(pipeline);

  return {
    totalMembers: result.totalMembers?.[0]?.count || 0,
    activeMembers: result.activeMembers?.[0]?.count || 0,
    leftMembers: result.leftMembers?.[0]?.count || 0,
  };
};


const getClubMembersForDashboardAnalytics = async ({
  companyOrganizer,
  year = new Date().getFullYear(),
}) => {
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  return ClubMembers.aggregate([
    {
      $match: {
        companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
        createdAt: { $gte: start, $lt: end },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: {
        path: "$user",  // ❗ NO accountState filter
        preserveNullAndEmptyArrays: true, // 🔥 THIS IS THE FIX
      },
    },
    {
      $project: {
        status: 1,
        createdAt: 1,
        gender: "$user.gender",
        dob: "$user.dob",
        timezone: "$user.timezone",
      },
    },
  ]);
};


const getAllClubMembersForTierAnalytics = async (companyOrganizer) => {
  return ClubMembers.find(
    { companyOrganizer },
    { level: 1 }
  ).lean();
};




module.exports = {
  getDashboardStats,
  getClubMembersForDashboardAnalytics,
  getAllClubMembersForTierAnalytics
};