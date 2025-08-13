const { FEATURE_KEYS } = require("../../admin/features/Feature");
const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { USER_TYPES } = require("../../models/UserModel");

const usermanagementService = require("./usermanagementService");

const createUserManagement = async (req, res) => {
  let { _id: userId, userType } = req.user;

  //CHECK USER TYPE
  // Validation setup
  let validateData = {
    rawData: [
      "userType",
      "email",
    ],
    enumFields: {
      "userType": USER_TYPES,
    },
  };

  if (!validateParams(req, res, validateData)) return;

  //organizer can create user and staff only
  if (userType === "organizer" && !["user", "staff"].includes(req.body.userType)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "not_authorized_to_create_user_type",
    });
  }

  // projection for query
  const projection = {
    email: 1,
    verificationStatus: 1,
  };
  // Check if email already exists
  const existingEmail = await usermanagementService.findUserManagementByQuery(
    { email: email.trim().toLowerCase() },
    projection
  );
  if (existingEmail) {
    if (
      (existingEmail.email === email.trim().toLowerCase(),
        existingEmail.verificationStatus.email === "verified")
    ) {
      return sendResponse({
        res,
        statusCode: 409,
        translationKey: "email_already",
      });
    }
  }
/* 
  const {
    profileIcon = "noImage.png",
    firstName = "",
    lastName = "",
    email = "",
    phoneNumber = {},
    password = "",
    userType = "",
    organization = "",
    modulesAccess = [],
  } = req.body;

  // Validation setup
  let validateData = {
    rawData: [
      "profileIcon",
      "firstName",
      "lastName",
      "email",
      "phoneNumber",
      "password",
      "userType",
      "organization",
      "modulesAccess",
    ],
    enumFields: {
      "userType": USER_TYPES,
      "modulesAccess": FEATURE_KEYS,
    },
    objectIdFields: ["organization"],
  };

  if (!validateParams(req, res, validateData)) return;

  // Check if email already exists
  const existingUserManagement = await usermanagementService.findUserManagementByQuery({ email });
  if (existingUserManagement) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "usermanagement_email_already_exists",
    });
  }

  // Construct usermanagement data per schema
  const usermanagementData = {
    profileIcon,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    phoneNumber,
    password,
    userType,
    organization,
    modulesAccess,
    creator: userId,
    status,
  }; */

  try {
    const usermanagement = await usermanagementService.createUserManagement({ data: usermanagementData });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "usermanagement_created_successfully",
      data: usermanagement,
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

const getUserManagements = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status } = req.query;
  let { _id } = req.user;
  try {
    let { usermanagements, meta } = await usermanagementService.getUserManagements({
      page,
      limit,
      keyword,
      status,
      creator: _id,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "usermanagements_fetched_successfully",
      data: usermanagements,
      meta
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
    });
  }
};

const updateUserManagement = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  let data = ({
    title,
    key,
    status,
  } = req.body);

  // Only add fields to validateData if present in req.body
  let validateData = {
    rawData: [],
    enumFields: {},
    objectIdFields: [],
  };

  if ("title" in req.body) validateData.rawData.push("title");
  if ("key" in req.body) {
    validateData.rawData.push("key");
    validateData.enumFields["key"] = ["ticketing", "reservationManagement", "loyaltyScanning", "inAppOrdering"];
  }

  if ("status" in req.body) {
    validateData.rawData.push("status");
    validateData.enumFields["status"] = ["active", "inactive"];
  }
  if (!validateParams(req, res, validateData)) return;


  try {
    const updated = await usermanagementService.updateUserManagement(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "usermanagement_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "usermanagement_updated_successfully",
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

const deleteUserManagement = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await usermanagementService.deleteUserManagement(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "usermanagement_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "usermanagement_deleted_successfully",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
    });
  }
};

const getUserManagementDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  try {
    let usermanagement = await usermanagementService.findUserManagementById(id);
    if (!usermanagement) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "usermanagement_not_found",
      });
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "usermanagement_details_fetched_successfully",
      data: usermanagement,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error.message,
    });
  }
};

module.exports = {
  createUserManagement,
  getUserManagements,
  updateUserManagement,
  deleteUserManagement,
  getUserManagementDetails,
};
