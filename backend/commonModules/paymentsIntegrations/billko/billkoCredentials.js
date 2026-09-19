const mongoose = require("mongoose");
const { cache } = require("@redisCache");
const {
  decryptSecret,
  BILLKO_READY_CACHE_NS,
} = require("./billkoAuth");

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

async function loadOrganizerBillkoReady(companyOrganizerId) {
  const User = mongoose.model("User");
  const organizer = await User.findById(companyOrganizerId)
    .select("companyDetails.billkoApiKeyEncrypted")
    .lean();

  return {
    exists: Boolean(organizer),
    ready: Boolean(organizer?.companyDetails?.billkoApiKeyEncrypted),
  };
}

async function assertOrganizerBillkoReady(companyOrganizerId) {
  if (!companyOrganizerId) {
    const error = new Error("billko_organizer_missing");
    error.statusCode = 400;
    throw error;
  }

  const status = await cache({
    namespace: BILLKO_READY_CACHE_NS,
    params: { id: String(companyOrganizerId) },
    ttl: null, // never expire
    fetchFn: () => loadOrganizerBillkoReady(companyOrganizerId),
  });

  if (!status?.exists) {
    const error = new Error("billko_account_required");
    error.statusCode = 400;
    throw error;
  }

  if (!status.ready) {
    const error = new Error("billko_account_required");
    error.statusCode = 403;
    throw error;
  }
}

/**
 * Payout readiness (Payout §5.3 subset for Phase A).
 * Checks OIB + IBAN (companyDetails.bankAccountNumber) only.
 * Does NOT validate structured address, IBAN checksum, or OIB mod-11 — Phase B.
 * Does NOT invent bank-upload UI. Do not block payment capture with this;
 * incomplete data keeps transactions PENDING for a later statement (§2.3).
 */
async function getOrganizerPayoutReadiness(companyOrganizerId) {
  if (!companyOrganizerId) {
    return {
      exists: false,
      ready: false,
      hasOib: false,
      hasIban: false,
      missing: ["organizer"],
    };
  }

  const User = mongoose.model("User");
  const organizer = await User.findById(companyOrganizerId)
    .select("companyDetails.oib companyDetails.bankAccountNumber")
    .lean();

  if (!organizer) {
    return {
      exists: false,
      ready: false,
      hasOib: false,
      hasIban: false,
      missing: ["organizer"],
    };
  }

  const oib = String(organizer.companyDetails?.oib || "").trim();
  const iban = String(organizer.companyDetails?.bankAccountNumber || "").trim();
  const hasOib = Boolean(oib);
  const hasIban = Boolean(iban);
  const missing = [];
  if (!hasOib) missing.push("oib");
  if (!hasIban) missing.push("iban");

  return {
    exists: true,
    ready: hasOib && hasIban,
    hasOib,
    hasIban,
    missing,
  };
}

async function assertOrganizerPayoutReady(companyOrganizerId) {
  const status = await getOrganizerPayoutReadiness(companyOrganizerId);
  if (!status.exists) {
    const error = new Error("payout_organizer_missing");
    error.statusCode = 400;
    error.code = "PAYOUT_ORGANIZER_MISSING";
    throw error;
  }
  if (!status.ready) {
    const error = new Error("payout_organizer_incomplete");
    error.statusCode = 403;
    error.code = "PAYOUT_ORGANIZER_INCOMPLETE";
    error.missing = status.missing;
    throw error;
  }
  return status;
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

/**
 * Organizer legal/party fields for payment confirmations.
 * Does not decrypt or require a Billko API key.
 */
async function getOrganizerParty(companyOrganizerId, organization = null) {
  if (!companyOrganizerId) {
    return {
      companyName: organization?.basicInfo?.name || "",
      oib: "",
      address: organization?.location?.fullAddress || "",
      venueName: organization?.basicInfo?.name || "",
      representativeName: "",
      hasBillkoApiKey: false,
    };
  }

  const User = mongoose.model("User");
  const organizer = await User.findById(companyOrganizerId)
    .select(
      "companyDetails.oib companyDetails.name companyDetails.location companyDetails.representativeName companyDetails.billkoApiKeyEncrypted",
    )
    .lean();

  const companyDetails = organizer?.companyDetails || {};
  return {
    companyName: companyDetails.name || organization?.basicInfo?.name || "",
    oib: companyDetails.oib || "",
    address:
      formatOrganizerAddress(companyDetails) ||
      organization?.location?.fullAddress ||
      "",
    venueName: organization?.basicInfo?.name || companyDetails.name || "",
    representativeName: companyDetails.representativeName || "",
    hasBillkoApiKey: Boolean(companyDetails.billkoApiKeyEncrypted),
  };
}

module.exports = {
  getPleisBillkoApiKey,
  getOrganizerBillkoApiKey,
  getOrganizerSeller,
  getOrganizerParty,
  formatOrganizerAddress,
  assertOrganizerBillkoReady,
  getOrganizerPayoutReadiness,
  assertOrganizerPayoutReady,
};
