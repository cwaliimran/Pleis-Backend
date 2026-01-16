const dashboardRepo = require("./dashboardRepository");
const { getDateRanges } = require("./utils/dashboardDate.utils");



const getDashboard = async ({ companyOrganizer, dateFilter, timezone }) => {
  const dateRanges =
    dateFilter === "all"
      ? null
      : getDateRanges({ dateFilter, timezone });

  const stats = await dashboardRepo.getDashboardStats({
    companyOrganizer,
    dateRanges,
  });

  return [
    {
      title: "Total Members",
      amount: stats.totalMembers,
    },
    {
      title:
        dateFilter === "thisMonth"
          ? "New Members this Month"
          : "New Members",
      amount: dateRanges ? stats.newMembers : stats.totalMembers,
    },
    {
      title: "Active Members",
      amount: stats.activeMembers,
    },
    {
      title: "Inactive Members",
      amount: stats.inactiveMembers,
    },
  ];
};

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
