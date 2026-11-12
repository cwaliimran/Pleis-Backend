const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const UserBillingInformationService = require("./userBillingInformationService");
const { isValidOib } = require("../../commonModules/paymentsIntegrations/ledger/ibanOibValidation");

/**
 * #67 / Billko v2.9 §2.1, §9.1: billing is a person (type 1) or a company (type 2).
 * A company needs both companyName and a valid OIB (mod-11). Returns the
 * normalized fields, or { error } with a translation key.
 */
const normalizeBillingParty = ({ type, companyName, personalIdentificationNumber, oib } = {}) => {
  const rawType = String(type ?? "person").toLowerCase();
  const isCompany = rawType === "company" || rawType === "2";
  if (!["person", "company", "1", "2"].includes(rawType)) return { error: "billing_type_invalid" };
  if (!isCompany) return { type: "person", companyName: "", personalIdentificationNumber: "" };
  const name = typeof companyName === "string" ? companyName.trim() : "";
  const id = String(personalIdentificationNumber ?? oib ?? "").replace(/\s+/g, "");
  if (!name) return { error: "billing_company_name_required" };
  if (!isValidOib(id)) return { error: "billing_oib_invalid" };
  return { type: "company", companyName: name, personalIdentificationNumber: id };
};





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

    /* ================= PERSON / COMPANY (#67) ================= */

    const party = normalizeBillingParty(req.body);
    if (party.error) {
      return sendResponse({ res, statusCode: 400, translationKey: party.error });
    }

    /* ================= BUILD DATA ================= */

    const data = {
      user: req.user._id, // Ensure user is an ObjectId
      email: email.trim().toLowerCase(), // Trim and lowercase the email
      firstName: firstName.trim(), // Trim the first name
      lastName: lastName.trim(), // Trim the last name
      ...party,
      ...(typeof req.body.phone === "string" && { phone: req.body.phone.trim() }),
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



  /* ================= PERSON / COMPANY (#67) ================= */
  const partyKeys = ["type", "companyName", "personalIdentificationNumber", "oib"];
  if (partyKeys.some((key) => req.body[key] !== undefined)) {
    const party = normalizeBillingParty(req.body);
    if (party.error) {
      return sendResponse({ res, statusCode: 400, translationKey: party.error });
    }
    Object.assign(data, party);
  }
  if (typeof req.body.phone === "string") data.phone = req.body.phone.trim();

  /* ================= UPDATE ================= */
  try {
    const updated = await UserBillingInformationService.updateUserBillingInformation(id, data, req.user._id);

    if (!updated || updated.error) {
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