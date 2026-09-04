const mongoose = require("mongoose");
const { decryptSecret } = require("./billkoAuth");

function getPleisBillkoApiKey() {
  const key = process.env.BILLKO_PLEIS_API_KEY;
  if (!key) {
    const error = new Error("billko_pleis_api_key_missing");
    error.code = "E01001";
    error.statusCode = 500;
    throw error;
  }
  return key;
}

async function getOrganizerBillkoApiKey(companyOrganizerId) {
  if (!companyOrganizerId) {
    const error = new Error("billko_organizer_missing");
    error.statusCode = 400;
    throw error;
  }

  const User = mongoose.model("User");
  const organizer = await User.findById(companyOrganizerId)
    .select("companyDetails.billkoApiKeyEncrypted companyDetails.oib companyDetails.name companyDetails.location companyDetails.representativeName")
    .lean();

  const encrypted = organizer?.companyDetails?.billkoApiKeyEncrypted;
  if (!encrypted) {
    const error = new Error("billko_account_required");
    error.code = "E01001";
    error.statusCode = 403;
    throw error;
  }

  return {
    apiKey: decryptSecret(encrypted),
    organizer,
  };
}

async function assertOrganizerBillkoReady(companyOrganizerId) {
  if (!companyOrganizerId) {
    const error = new Error("billko_account_required");
    error.statusCode = 403;
    throw error;
  }

  const User = mongoose.model("User");
  const organizer = await User.findById(companyOrganizerId)
    .select("companyDetails.billkoApiKeyEncrypted")
    .lean();

  if (!organizer?.companyDetails?.billkoApiKeyEncrypted) {
    const error = new Error("billko_account_required");
    error.statusCode = 403;
    throw error;
  }
}

function formatOrganizerAddress(companyDetails = {}) {
  const location = companyDetails.location || {};
  return [
    location.fullAddress,
    [location.postalCode, location.city].filter(Boolean).join(" "),
    location.country,
  ]
    .filter(Boolean)
    .join(", ");
}

async function getOrganizerSeller(companyOrganizerId, organization) {
  const { apiKey, organizer } = await getOrganizerBillkoApiKey(companyOrganizerId);
  const companyDetails = organizer?.companyDetails || {};
  return {
    apiKey,
    companyName: companyDetails.name || organization?.basicInfo?.name || "",
    oib: companyDetails.oib || "",
    address: formatOrganizerAddress(companyDetails) || organization?.location?.fullAddress || "",
    venueName: organization?.basicInfo?.name || companyDetails.name || "",
    representativeName: companyDetails.representativeName || "",
  };
}

module.exports = {
  getPleisBillkoApiKey,
  getOrganizerBillkoApiKey,
  getOrganizerSeller,
  formatOrganizerAddress,
  assertOrganizerBillkoReady,
};
