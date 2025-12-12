const mongoose = require("mongoose");
const {
  BuyMenuItemReward,
  TicketReward,
  CustomReward,
  Reward,
} = require("../../../commonModules/loyalty/rewards/models");


// Get rewards by company organizer
// Get ALL rewards by company organizer (no pagination)
const getRewardsByCompanyOrganizer = async ({ companyOrganizer, status }) => {
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };

  if (status) query.status = status;
  else query.status = { $ne: "deleted" };

  return Reward.find(query)
    .populate("menuItem", "title")
    .populate({ path: "tierLimit" })
    .sort({ createdAt: -1 }) // still useful for ordering inside groups
    .lean();
};


// Count rewards by organizer
const countRewardsByCompanyOrganizer = async ({ companyOrganizer, status }) => {
  const query = {
    companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer),
  };

  if (status) query.status = status;
  else query.status = { $ne: "deleted" };

  return Reward.countDocuments(query);
};

module.exports = {
  getRewardsByCompanyOrganizer,
  countRewardsByCompanyOrganizer,
};
