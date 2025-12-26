// services/reservationservice.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");
const { generateMeta, getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
const { reservationsFormatter } = require("../reservations/formaters/reservationFormetter");
const Reservations = require("@ReservationsModel");
const UserReservations = require("@UserReservationsModel");
const GlobalReferralRepo = require("./loyaltyReferralRepository");
const mongoose = require("mongoose");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
  convertTimezoneToUtc,
  getStartAndEndOfMonth,
  getStartAndEndOfWeek,
} = require("@utils/responseUtil");

const createGlobalReferral = async (data) => {
  let GlobalReferral = await GlobalReferralRepo.createGlobalReferral(data);
  return GlobalReferral;
};

const saveReferralData = async (id) => {

  let GlobalReferral = await GlobalReferralRepo.saveReferralData(id);
  return GlobalReferral;
};

const saveUserReferralData = async (username, ipAddress) => {


  let GlobalReferral = await GlobalReferralRepo.saveUserReferralData(username, ipAddress);
  return GlobalReferral;
};
  const getGlobalReferrals = async ({ timezone, page, limit, keyword, status, userId, date, range,type }) => {
    const skip = limit === 0 ? 0 : (page - 1) * limit;
    const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
    let { globalReferral, meta } = await GlobalReferralRepo.getGlobalReferrals({ timezone, page, limit, keyword, status, userId, date, range, today, skip,type });

    return {
      globalReferral,
      meta
    };
  };

  const getUserReferradrecord = async ({ timezone, page, limit, keyword, status, userId, date, range }) => {
    const skip = limit === 0 ? 0 : (page - 1) * limit;
    const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
    let { globalReferral, meta } = await GlobalReferralRepo.getUserReferradrecord({ timezone, page, limit, keyword, status, userId, date, range, today, skip });

    return {
      globalReferral,
      meta
    };
  };






const createUserReferradrecord = async (data) => {


  let GlobalReferral = await GlobalReferralRepo.createUserReferradrecord(data);
  return GlobalReferral;
};

const getUserOrganizationPublicIds = async (userId, organization) => {

  let result = await GlobalReferralRepo.getUserOrganizationPublicIds(userId, organization);
  return result;
};
  module.exports = {
    getUserOrganizationPublicIds,
    // createGlobalReferral,
    // getGlobalReferrals,
    // saveReferralData,
    // saveUserReferralData,
    // createUserReferradrecord,
    // getUserReferradrecord
    

  };