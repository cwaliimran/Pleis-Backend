const { getActiveTiersWithProjection } = require("../../tiers/tiersRepository");
const dashboardRepo = require("./dashboardRepository");
const { buildClubMembersDashboardAnalytics } = require("./utils/buildClubMembersDashboardAnalytics");
const { buildTierAnalytics } = require("./utils/buildTierAnalytics");
const { getDateRanges } = require("./utils/dashboardDate.utils");



const getDashboard = async ({ companyOrganizer, dateFilter, timezone }) => {
  const dateRanges =
    dateFilter === "all"
      ? null
      : getDateRanges({ dateFilter, timezone });

  const [stats, clubMembersAnalytics, tiersAnalytics] = await Promise.all([
    dashboardRepo.getDashboardStats({
      companyOrganizer,
      dateRanges,
    }),
    getClubMembersDashboardAnalytics({
      companyOrganizer,
      year: new Date().getFullYear(),
    }),
    getAllClubMembersForTierAnalyticsService({
      companyOrganizer,
    }),
  ]);

  return {
    stats: [
      {
        title: "Total Members",
        amount: stats.totalMembers,
      },
      {
        title:
          dateFilter === "thisMonth"
            ? "New Members this Month"
            : "New Members",
        amount: dateRanges ? stats.totalMembers : stats.totalMembers,
      },
      {
        title: "Active Members",
        amount: stats.activeMembers,
      },
      {
        title: "Left Members",
        amount: stats.leftMembers,
      },
    ],
    clubMembersAnalytics,
    tiersAnalytics
  }
};

const getClubMembersDashboardAnalytics = async ({
  companyOrganizer,
  year,
}) => {
  const members =
    await dashboardRepo.getClubMembersForDashboardAnalytics({
      companyOrganizer,
      year,
    });

  return buildClubMembersDashboardAnalytics(members);
};


const getAllClubMembersForTierAnalyticsService = async ({ companyOrganizer }) => {
  const [members, tiers] = await Promise.all([
    dashboardRepo.getAllClubMembersForTierAnalytics(companyOrganizer),
    getActiveTiersWithProjection(),
  ]);
  return buildTierAnalytics(members, tiers);
}

/** DASHBOARD STATS – Load individual card data
 */
const getDashboardStats = async ({ companyOrganizer, dateFilter, timezone }) => {
  const stats = await dashboardRepo.getDashboardStats({ companyOrganizer, dateFilter, timezone });
  return stats;
};


module.exports = {
  getDashboard,
  getDashboardStats,
};
