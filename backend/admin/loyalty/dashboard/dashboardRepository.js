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
  const match = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };

  const pipeline = [
    { $match: match },
    {
      $facet: {
        totalMembers: [{ $count: "count" }],

        activeMembers: [
          { $match: { status: "active" } },
          { $count: "count" },
        ],

        inactiveMembers: [
          { $match: { status: { $ne: "active" } } },
          { $count: "count" },
        ],

        ...(dateRanges
          ? {
              newMembers: [
                {
                  $match: {
                    createdAt: {
                      $gte: dateRanges.start,
                      $lte: dateRanges.end,
                    },
                  },
                },
                { $count: "count" },
              ],
            }
          : {}),
      },
    },
  ];

  const [result] = await ClubMembers.aggregate(pipeline);

  return {
    totalMembers: result.totalMembers[0]?.count || 0,
    activeMembers: result.activeMembers[0]?.count || 0,
    inactiveMembers: result.inactiveMembers[0]?.count || 0,
    newMembers: result.newMembers?.[0]?.count || 0,
  };
};

module.exports = {
  getDashboardStats,
};