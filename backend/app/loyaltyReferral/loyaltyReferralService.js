
const GlobalReferralRepo = require("./loyaltyReferralRepository");
const mongoose = require("mongoose");
const {
  sendResponse,

} = require("@utils/responseUtil");









const getUserOrganizationPublicIds = async (userId, organization) => {

  let result = await GlobalReferralRepo.getUserOrganizationPublicIds(userId, organization);
  return result;
};
const saveUserReferralData = async (organizer,referrer) => {

  let result = await GlobalReferralRepo.saveUserReferralData(organizer, referrer);
  return result;
};
  module.exports = {
    getUserOrganizationPublicIds,
  saveUserReferralData
    

  };