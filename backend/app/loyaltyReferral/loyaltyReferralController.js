
const {
  sendResponse,
} = require("../../helperUtils/responseUtil");

const globalReferralService = require("./loyaltyReferralService");


const getUserOrganizationPublicIds = async (userId,organization) => {

  try {
    const result = await globalReferralService.getUserOrganizationPublicIds(userId,organization);
    if (!result) {
      return result
    }
   return result
  } catch (error) {
    return null
  }
};

const saveUserReferralData = async (organizer,referrer) => {

  try {
    const result = await globalReferralService.saveUserReferralData(organizer,referrer);
    if (!result) {
      return result
    }
   return result
  } catch (error) {
    return null
  }
};


module.exports = {

  getUserOrganizationPublicIds,
  saveUserReferralData
  

};