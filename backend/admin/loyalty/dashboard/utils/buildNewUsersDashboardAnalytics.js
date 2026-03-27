/* ------------------------------------------
   CONSTANTS
------------------------------------------ */

const months = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/* ------------------------------------------
   MAIN UTILITY
------------------------------------------ */

const buildNewUsersDashboardAnalytics = (users = []) => {
  const userGrowth = Array(12).fill(0);

  for (const u of users) {
    if (u.createdAt) {
      const m = new Date(u.createdAt).getMonth();
      if (m >= 0 && m < 12) userGrowth[m]++;
    }
  }

  return {
    userGrowth: months.map((month, index) => ({
      month,
      total: userGrowth[index]
    }))
  };
};

module.exports = {
  buildNewUsersDashboardAnalytics
};