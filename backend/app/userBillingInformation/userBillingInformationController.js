const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const UserBillingInformationService = require("./userBillingInformationService");





const createUserBillingInformation = async (req, res) => {
  try {
    const {
      email,
      firstName,
      lastName,
      billingAddress,
      status = "active",

    } = req.body;
    /* ================= BASIC REQUIRED FIELDS ================= */

    if (
      !validateParams(req, res, {
        rawData: ["email", "firstName", "lastName", "billingAddress"], // Ensure all required fields are provided
      })
    ) return;


    /* ================= BILLING ADDRESS VALIDATION ================= */

    if (!billingAddress || typeof billingAddress !== "object") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "BillingAddress_invalid", // Translation key for invalid billing address
      });
    }

    const { address, city, postalCode, country } = billingAddress;

    if (!address || typeof address !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "BillingAddress_address_invalid", // Translation key for invalid address
      });
    }

    if (!city || typeof city !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "BillingAddress_city_invalid", // Translation key for invalid city
      });
    }

    if (!postalCode || typeof postalCode !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "BillingAddress_postalCode_invalid", // Translation key for invalid postal code
      });
    }

    if (!country || typeof country !== "string") {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "BillingAddress_country_invalid", // Translation key for invalid country
      });
    }

    /* ================= BUILD DATA ================= */

    const data = {
      user: req.user._id, // Ensure user is an ObjectId
      email: email.trim().toLowerCase(), // Trim and lowercase the email
      firstName: firstName.trim(), // Trim the first name
      lastName: lastName.trim(), // Trim the last name
      billingAddress: {
        address: billingAddress.address.trim(),
        city: billingAddress.city.trim(),
        postalCode: billingAddress.postalCode.trim(),
        country: billingAddress.country.trim(),
      },
      status: status.trim().toLowerCase(), // Ensure status is lowercase
    };

    /* ================= CREATE USER BILLING INFORMATION ================= */

    const userBillingInformation = await UserBillingInformationService.createUserBillingInformation(data);

    if (!userBillingInformation) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "UserBillingInformation_creation_failed", // Translation key for failed creation
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "UserBillingInformation_created_successfully", // Translation key for successful creation
      data: userBillingInformation,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};


const getUserBillingInformations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range } = req.query;
  try {


    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { UserBillingInformations, meta } = await UserBillingInformationService.getUserBillingInformations({
        timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "UserBillingInformations_fetched_successfully",
      data: UserBillingInformations,
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
const updateUserBillingInformation = async (req, res) => {
  const { id } = req.params;

  let {
    email,
    billingAddress,
    status,
    firstName,
    lastName,
  } = req.body;

  if (!id) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "UserBillingInformation_id_required", // Adjust translation key
    });
  }

  /* ================= BUILD UPDATE DATA ================= */
  const data = {};
  if (email !== undefined) {
    data.email = email.trim().toLowerCase(); // Ensure email is lowercase
  }
  if (firstName !== undefined) {
    data.firstName = firstName.trim();
  }
  if (lastName !== undefined) {
    data.lastName = lastName.trim();
  }
  if (status !== undefined) {
    data.status = status.trim().toLowerCase(); // Ensure status is lowercase
  }
  if (billingAddress !== undefined) {
    if (typeof billingAddress !== "object" || billingAddress === null) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "UserBillingInformation_billingAddress_invalid", // Adjust translation key
      });
    }

    // Only validate and update fields that are present in the request
    if (billingAddress.address !== undefined) {
      const { address } = billingAddress;
      if (!address || typeof address !== "string") {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "UserBillingInformation_billingAddress_address_invalid", // Adjust translation key
        });
      }
      data.billingAddress = data.billingAddress || {}; // Initialize the object if not already
      data.billingAddress.address = address.trim();
    }

    if (billingAddress.city !== undefined) {
      const { city } = billingAddress;
      if (!city || typeof city !== "string") {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "UserBillingInformation_billingAddress_city_invalid", // Adjust translation key
        });
      }
      data.billingAddress = data.billingAddress || {}; // Initialize the object if not already
      data.billingAddress.city = city.trim();
    }

    if (billingAddress.postalCode !== undefined) {
      const { postalCode } = billingAddress;
      if (!postalCode || typeof postalCode !== "string") {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "UserBillingInformation_billingAddress_postalCode_invalid", // Adjust translation key
        });
      }
      data.billingAddress = data.billingAddress || {}; // Initialize the object if not already
      data.billingAddress.postalCode = postalCode.trim();
    }

    if (billingAddress.country !== undefined) {
      const { country } = billingAddress;
      if (!country || typeof country !== "string") {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "UserBillingInformation_billingAddress_country_invalid", // Adjust translation key
        });
      }
      data.billingAddress = data.billingAddress || {}; // Initialize the object if not already
      data.billingAddress.country = country.trim();
    }
  }



  /* ================= UPDATE ================= */
  try {
    const updated = await UserBillingInformationService.updateUserBillingInformation(id, data);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "UserBillingInformation_not_found", // Adjust translation key
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "UserBillingInformation_updated_successfully", // Adjust translation key
      data: updated,
    });

  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message,
      error,
    });
  }
};


const deleteUserBillingInformation = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await UserBillingInformationService.deleteUserBillingInformation(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "UserBillingInformation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "UserBillingInformation_deleted_successfully",
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
  createUserBillingInformation,
  getUserBillingInformations,
  updateUserBillingInformation,
  deleteUserBillingInformation,

};