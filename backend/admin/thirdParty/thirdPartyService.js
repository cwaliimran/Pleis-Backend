// services/Thirdpartyservice.js
const { buildKeywordQueryFromModels } = require("../../helperUtils/dbUtils/queryUtil");

const { generateMeta, getCurrentDateInTimezone } = require("../../helperUtils/responseUtil");
// const { ThirdpartysFormatter } = require("../../app/Thirdpartys/formaters/ThirdpartyFormetter");
const Thirdpartys = require("@ThirdPartyModel");
const ThirdpartyRepo = require("./thirdPartyRepository");
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

const createThirdparty = async (data) => {
  let Thirdparty = await ThirdpartyRepo.createThirdparty(data);
  return Thirdparty;
};

// Populate venue data for Thirdpartys (updated for new schema)
const getThirdpartys = async ({ timezone, page, limit, keyword, status, createrId,  date,  }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let { Thirdpartys, meta } = await ThirdpartyRepo.getThirdpartys({ timezone, page, limit, keyword, status, createrId,  date , skip });

  return {
    Thirdpartys,
    meta
  };
};

const updateThirdparty = async (id, data) => {
  // CASE 1: If controller passed { $set: data }
  const payload = data.$set ? data.$set : data;

  // Find existing reward
  const Thirdparty = await Thirdpartys.findById(id);
  if (!Thirdparty) {
    return { error: "thirdparty_reward_not_found" };
  }

  // Allowed fields according to new GlobalThirdParty schema
  const allowedFields = [
    "image",
    "title",
    "description",
    "pointCost",
    "claimLimit",
    "rewardSourceLink",
    "publicKeyForPartner",
    "statusLevel",
    "status",
    "notes"
  ];

  // Build update data based on allowed fields
  const updateData = {};
  for (const key of allowedFields) {
    if (payload[key] !== undefined) {
      updateData[key] = payload[key];
    }
  }

  // If no allowed fields found → return unchanged
  if (Object.keys(updateData).length === 0) {
    return Thirdparty.toObject();
  }

  // Apply update to document instance
  Object.assign(Thirdparty, updateData);

  // Save updated document
  await Thirdparty.save();

  return Thirdparty.toObject();
};


  const deleteThirdparty = async (id) => {
      const updated = await ThirdpartyRepo.findByIdAndUpdate(id, {
        status: "deleted",
      });
      if (!updated) return null;
      return true;
    };

const getThirdpartyDetails = async (id) => {
      const Thirdparty = await ThirdpartyRepo.findThirdpartyById(id);
      if (!Thirdparty) return null;
      return ThirdpartysFormatter(Thirdparty);
    };





const getUserThirdpartys = async ({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, ThirdpartyStatus,ThirdpartyId }) => {
      const skip = limit === 0 ? 0 : (page - 1) * limit;
      const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
      let { Thirdpartys, meta } = await ThirdpartyRepo.getUserThirdpartys({ timezone, page, limit, keyword, status, userId, organizationsId, date, range, today, skip, ThirdpartyStatus, ThirdpartyId });

      return {
        Thirdpartys,
        meta
      };
    };

const updateUserThirdpartyStatus = async (id, value) => {
      const updated = await UserThirdpartys.findByIdAndUpdate(id, {
        ThirdpartyStatus: value,
      });
      if (!updated) return null;
      return true;
    };



const updateUserThirdparty = async (data) => {
  const UserThirdparty = await ThirdpartyRepo.findUserThirdpartyById(data.id);

console.log("UserThirdparty", UserThirdparty);
  const allowedFields = [
    "firstName",
    "lastName",
    "phoneNumber",
    "partySize",
    "ThirdpartyType",
    "timingSlots",
    "notes",
  ];

  if (data.timingSlots) {
    if (!UserThirdparty.timingSlots) {
      UserThirdparty.timingSlots = { enabled: false, dateTimeSlots: [] };
    }

    if (data.timingSlots.enabled !== undefined) {
      UserThirdparty.timingSlots.enabled = data.timingSlots.enabled;
    }

    if (Array.isArray(data.timingSlots.dateTimeSlots)) {
      UserThirdparty.timingSlots.dateTimeSlots = data.timingSlots.dateTimeSlots;
    }
  }

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined && key !== "timingSlots") {
      updateData[key] = data[key];
    }
  }
console.log("updateData",updateData );
  Object.assign(UserThirdparty, updateData);

  await UserThirdparty.save();

  return {
    message: "Thirdparty updated successfully",
    Thirdparty: UserThirdparty
  };
};


  module.exports = {
    createThirdparty,
    getThirdpartys,
    updateThirdparty,
    // getThirdpartyDetails,
    deleteThirdparty,
    // getUserThirdpartys,
    // updateUserThirdpartyStatus,
    // updateUserThirdparty,
    // findByIdAndUpdate
  };