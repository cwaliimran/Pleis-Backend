const { calculatePointsRepo } = require("./pointsEarningsRepository");
const calculatePoints = async ({ userId, companyOrganizer, totalSpending}) => {

  let points = await calculatePointsRepo(userId, companyOrganizer, totalSpending);

  return {
    pointsEarnings: points
  };
};

module.exports = {
  calculatePoints,
};
