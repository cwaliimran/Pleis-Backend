const buildUserStatusAnalytics = (
  allActiveUsersCurrent = 0,
  allInactiveUsersCurrent = 0
) => {

  const total = allActiveUsersCurrent + allInactiveUsersCurrent;

  return [
    {
      name: "active",
      count: allActiveUsersCurrent,
      percent: total ? Math.round((allActiveUsersCurrent / total) * 100) : 0
    },
    {
      name: "inactive",
      count: allInactiveUsersCurrent,
      percent: total ? Math.round((allInactiveUsersCurrent / total) * 100) : 0
    }
  ];
};

module.exports = {
  buildUserStatusAnalytics
};