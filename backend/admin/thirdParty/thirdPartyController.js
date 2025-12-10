
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");
const { statusLevelsFormatter, formatUpdate } = require("./formatters/statusLevelsFormatter");

const ThirdpartyService = require("./thirdPartyService");

const createThirdparty = async (req, res) => {
  const {
    image,
    title,
    description,
    pointCost,
    claimLimit,
    rewardSourceLink,
    publicKeyForPartner,
    statusLevel,
    status
  } = req.body;

  const userId = req.user._id;

  // ----------------------
  // Basic Required Fields
  // ----------------------
  if (
    !validateParams(req, res, {
      rawData: [
        "title",
        "pointCost",
        "statusLevel",
        "rewardSourceLink",
        "publicKeyForPartner",

      ],
    })
  ) {
    return;
  }

  // ----------------------
  // Build Data
  // ----------------------
  let data = {
    image: image || "",
    title,
    description: description || "",
    pointCost,
    claimLimit: claimLimit || null,
    rewardSourceLink: rewardSourceLink || "",
    publicKeyForPartner: publicKeyForPartner || "",
    statusLevel,
    status: status || "active",
    createID: userId,
  };

  try {
    const reward = await ThirdpartyService.createThirdparty(data);

    if (!reward) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "thirdparty_reward_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "thirdparty_reward_created_successfully",
      data: reward,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};


const getThirdpartys = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, } = req.query;
  try {
    const createrId = req.user._id;
    const timezone = req.user.timezone;
    const { Thirdpartys, meta } = await ThirdpartyService.getThirdpartys({
      timezone,
      page,
      limit,
      keyword,
      status,
      createrId,
      date,
    });
const formattedupdates = Thirdpartys.map(event => formatUpdate(event));
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Thirdpartys_fetched_successfully",
      data: formattedupdates,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const getThirdpartyDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const Thirdparty = await ThirdpartyService.getThirdpartyDetails(id);
    if (!Thirdparty) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Thirdparty_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Thirdparty_details_fetched_successfully",
      data: Thirdparty,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const updateThirdparty = async (req, res) => {
  const { id } = req.params;
  const {
    image,
    title,
    description,
    pointCost,
    claimLimit,
    rewardSourceLink,
    publicKeyForPartner,
    statusLevel,
    status,
    notes
  } = req.body;

  const userId = req.user._id;

  // Validate ID
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  // Build update data
  let data = {
    ...(image !== undefined && { image }),
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(pointCost !== undefined && { pointCost }),
    ...(claimLimit !== undefined && { claimLimit }),
    ...(rewardSourceLink !== undefined && { rewardSourceLink }),
    ...(publicKeyForPartner !== undefined && { publicKeyForPartner }),
    ...(statusLevel !== undefined && { statusLevel }),
    ...(status !== undefined && { status }),
    ...(notes !== undefined && { notes }),
    updateID: userId
  };

  try {
    const updated = await ThirdpartyService.updateThirdparty(
      id,
      { $set: data },
      { new: true }
    );

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "thirdparty_reward_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "thirdparty_reward_updated_successfully",
      data: updated,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};


const deleteThirdparty = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await ThirdpartyService.deleteThirdparty(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Thirdparty_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Thirdparty_deleted_successfully",
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};









const getUserThirdpartys = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range, organizationsId, companyOrganizer, ThirdpartyStatus = "pending", ThirdpartyId } = req.query;
  
  try {
    if (
      (!companyOrganizer || companyOrganizer === "undefined" || companyOrganizer === "null") &&
      (!organizationsId || !Array.isArray(JSON.parse(organizationsId)) || JSON.parse(organizationsId).length === 0)
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "companyOrganizer_or_organizationsIds_is_required",
      });
    }
    if (!ThirdpartyId || ThirdpartyId === "undefined" || ThirdpartyId === "null") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "ThirdpartyId_is_required",
      });
    }

    const userId = companyOrganizer;
    const timezone = req.user.timezone;
    const { Thirdpartys, meta } = await ThirdpartyService.getUserThirdpartys({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      organizationsId,
      date,
      range,
      ThirdpartyStatus,
      ThirdpartyId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Thirdpartys_fetched_successfully",
      data: Thirdpartys,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};







const updateUserThirdpartyStatus = async (req, res) => {
  const { id, value } = req.params;
  const validStatuses = ["confirmed", "rejected", "pending", "cancelled"];
  if (!validStatuses.includes(value)) {
    return res.status(404).json({
      message: "Invalid Thirdparty status value. Accepted values are: confirmed, rejected, pending, cancelled.",
    });
  }
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await ThirdpartyService.updateUserThirdpartyStatus(id, value);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Thirdparty_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Thirdparty_updated_successfully",
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const updateUserThirdparty = async (req, res) => {
  const { id, userId } = req.params;
  const {
    firstName,
    lastName,
    partySize,
    phoneNumber,
    ThirdpartyType,
    timingSlots,
    notes,
  } = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  const timezone = req.user.timezone;

  let data = {
    id,
    userId,
    firstName,
    lastName,
    partySize,
    phoneNumber,
    ThirdpartyType,
    timingSlots,
    notes,

  };

  if (data.timingSlots) {
    const slots = data.timingSlots.dateTimeSlots || [];

    if (!Array.isArray(slots) || slots.length === 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "timing_slots_required_when_enabled",
      });
    }

    for (const dateBlock of slots) {
      if (!dateBlock.date) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_date_in_timing_slots",
        });
      }

      if (!Array.isArray(dateBlock.timeSlots) || dateBlock.timeSlots.length === 0) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "time_slots_required_for_date",
        });
      }


      for (const slot of dateBlock.timeSlots) {

        if (!slot.startTime || !slot.endTime) {
          return sendResponse({
            res,
            statusCode: 400,
            translationKey: "invalid_start_or_end_time_in_slot",
          });
        }

        // Convert times to UTC
        slot.startTime = convertTimezoneToUtc(
          `${dateBlock.date} ${slot.startTime}`,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );

        slot.endTime = convertTimezoneToUtc(
          `${dateBlock.date} ${slot.endTime}`,
          timezone,
          "YYYY-MM-DD hh:mm A"
        );
        console.log("start time ", slots.startTime);

      }

    }
  }


  // Validate params
  if (
    !validateParams(req, res, {
      pathParams: ["id", "userId"],
      objectIdFields: ["id", "userId"],
    })
  ) {
    return; // Ensure you return if validation fails
  }
  const currentUser = req.user;
  // Only admin, manager, or organizer can update other users' profiles
  if (
    currentUser._id.toString() !== id &&
    !["admin", "manager", "organizer"].includes(currentUser.userType)
  ) {
    return sendResponse({
      res,
      statusCode: 403,
      translationKey: "unauthorized_to_perform_this_action",
    });
  }

  try {
    const update = await ThirdpartyService.updateUserThirdparty(data);
    if (!update) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Thirdparty_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Thirdparty_updated_successfully",
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};



module.exports = {
  createThirdparty,
  getThirdpartys,
  updateThirdparty,
  deleteThirdparty,
  getThirdpartyDetails,
  getUserThirdpartys,
  updateUserThirdpartyStatus,
  updateUserThirdparty,
};