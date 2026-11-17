/**
 * Legal documents + consent types (PLEIS Legal & Pricing Compliance spec, sections 1 + 5).
 */

// Versioned documents the platform publishes (admin → Settings → Terms). Document table, spec p.1–2.
const LEGAL_DOCUMENT_TYPES = Object.freeze({
  TERMS_OF_USE: "terms_of_use", // buyer
  PRIVACY_POLICY: "privacy_policy", // buyer + partner
  SALES_TERMS: "sales_terms", // buyer (checkout)
  PARTNER_TERMS: "partner_terms", // partner
  PSA: "psa", // partner — Partner Service Agreement (standard text; accepted on subscription / module activation)
  DPA: "dpa", // partner — Data Processing Agreement, Annex 3 of the PSA (accepted with the PSA)
  DSA_POLICY: "dsa_policy", // public — DSA Compliance and Contact Point Policy (not accepted in app; website)
});

// Everything that can appear in the consent log (document_type in spec section 5).
const CONSENT_TYPES = Object.freeze({
  ...LEGAL_DOCUMENT_TYPES,
  LOYALTY_CONSENT: "loyalty_consent",
  WITHDRAWAL_WAIVER: "withdrawal_waiver",
  AGE_16: "age_16",
});

const CONSENT_ACTIONS = Object.freeze({
  ACCEPTED: "accepted",
  WITHDRAWN: "withdrawn",
});

const DOCUMENT_TITLES = Object.freeze({
  terms_of_use: "Terms of Use",
  privacy_policy: "Privacy Policy",
  sales_terms: "Sales Terms",
  partner_terms: "Partner Terms and Conditions",
  psa: "Partner Service Agreement",
  dpa: "Data Processing Agreement",
  dsa_policy: "DSA Compliance and Contact Point Policy",
});

// Legacy AdminSettings field each document mirrors (keeps /settings/* endpoints working).
// Documents without a legacy field start empty and get version 1 on their first publish.
const LEGACY_SETTINGS_FIELD = Object.freeze({
  terms_of_use: "customer_terms_and_conditions",
  privacy_policy: "privacy_policy",
  sales_terms: "sales_terms",
  partner_terms: "terms_and_conditions",
});

// Documents a given account type must have accepted (current version) to use the product.
const REQUIRED_DOCUMENTS_BY_USER_TYPE = Object.freeze({
  user: [LEGAL_DOCUMENT_TYPES.TERMS_OF_USE, LEGAL_DOCUMENT_TYPES.PRIVACY_POLICY],
  organizer: [LEGAL_DOCUMENT_TYPES.PARTNER_TERMS, LEGAL_DOCUMENT_TYPES.PRIVACY_POLICY],
});

// Documents that can be accepted through POST /legal/accept (registration / re-acceptance).
// PSA + DPA are accepted in one step on the generated PSA (spec 1.4: "No separate DPA
// checkbox"); the DSA policy is never accepted in the app.
const DIRECTLY_ACCEPTABLE_TYPES = Object.freeze([
  LEGAL_DOCUMENT_TYPES.TERMS_OF_USE,
  LEGAL_DOCUMENT_TYPES.PRIVACY_POLICY,
  LEGAL_DOCUMENT_TYPES.SALES_TERMS,
  LEGAL_DOCUMENT_TYPES.PARTNER_TERMS,
]);

// Where each account type sees its documents (spec 1.5).
const DISPLAYED_DOCUMENTS_BY_USER_TYPE = Object.freeze({
  // App → Settings → Legal
  user: [LEGAL_DOCUMENT_TYPES.TERMS_OF_USE, LEGAL_DOCUMENT_TYPES.SALES_TERMS, LEGAL_DOCUMENT_TYPES.PRIVACY_POLICY],
  // Partner Dashboard → Legal
  organizer: [
    LEGAL_DOCUMENT_TYPES.PARTNER_TERMS,
    LEGAL_DOCUMENT_TYPES.PSA,
    LEGAL_DOCUMENT_TYPES.DPA,
    LEGAL_DOCUMENT_TYPES.PRIVACY_POLICY,
  ],
});

// Loyalty club data-sharing consent has no stored document; its text is versioned here.
const LOYALTY_CONSENT_VERSION = "1";
const loyaltyConsentText = (organizerName) =>
  `I agree that my data will be shared with ${organizerName || "this organizer"}.`;

module.exports = {
  LEGAL_DOCUMENT_TYPES,
  CONSENT_TYPES,
  CONSENT_ACTIONS,
  DOCUMENT_TITLES,
  LEGACY_SETTINGS_FIELD,
  REQUIRED_DOCUMENTS_BY_USER_TYPE,
  DIRECTLY_ACCEPTABLE_TYPES,
  DISPLAYED_DOCUMENTS_BY_USER_TYPE,
  LOYALTY_CONSENT_VERSION,
  loyaltyConsentText,
};
