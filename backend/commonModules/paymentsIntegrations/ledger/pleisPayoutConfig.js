/**
 * Pleis debtor/creditor payout config from env (Payout §5.2).
 * Fail hard if locked/operating IBAN missing or equal — never hardcode secrets.
 */

function env(name, fallback = "") {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return fallback;
  return String(v).trim();
}

function loadPleisPayoutConfig(overrides = {}) {
  const cfg = {
    name: overrides.name ?? env("PLEIS_NAME", "Pleis d.o.o."),
    oib: overrides.oib ?? env("PLEIS_OIB"),
    addressStreet: overrides.addressStreet ?? env("PLEIS_ADDRESS_STREET", "Ilica"),
    addressBuildingNo:
      overrides.addressBuildingNo ?? env("PLEIS_ADDRESS_BUILDING_NO", "1"),
    addressPostcode:
      overrides.addressPostcode ?? env("PLEIS_ADDRESS_POSTCODE", "10000"),
    addressTown: overrides.addressTown ?? env("PLEIS_ADDRESS_TOWN", "Zagreb"),
    addressCountry: overrides.addressCountry ?? env("PLEIS_ADDRESS_COUNTRY", "HR"),
    lockedIban: overrides.lockedIban ?? env("PLEIS_LOCKED_IBAN"),
    lockedBic: overrides.lockedBic ?? env("PLEIS_LOCKED_BIC", ""),
    lockedAccountName:
      overrides.lockedAccountName ??
      (env("PLEIS_LOCKED_ACCOUNT_NAME") || env("PLEIS_NAME", "Pleis d.o.o.")),
    operatingIban: overrides.operatingIban ?? env("PLEIS_OPERATING_IBAN"),
    operatingAccountName:
      overrides.operatingAccountName ??
      (env("PLEIS_OPERATING_ACCOUNT_NAME") || env("PLEIS_NAME", "Pleis d.o.o.")),
    operatingAccountOib:
      overrides.operatingAccountOib ??
      (env("PLEIS_OPERATING_ACCOUNT_OIB") || env("PLEIS_OIB")),
    goLiveDate: overrides.goLiveDate ?? env("PLEIS_PAYOUT_GO_LIVE_DATE", ""),
  };
  for (const key of Object.keys(cfg)) {
    if (cfg[key] == null) cfg[key] = "";
  }
  return cfg;
}

function assertPleisPayoutConfig(cfg = loadPleisPayoutConfig()) {
  const missing = [];
  if (!cfg.lockedIban) missing.push("PLEIS_LOCKED_IBAN");
  if (!cfg.operatingIban) missing.push("PLEIS_OPERATING_IBAN");
  if (!cfg.oib) missing.push("PLEIS_OIB");
  if (!cfg.name) missing.push("PLEIS_NAME");

  const locked = String(cfg.lockedIban || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  const operating = String(cfg.operatingIban || "")
    .replace(/\s+/g, "")
    .toUpperCase();

  if (missing.length) {
    const err = new Error(`payout_config_missing: ${missing.join(", ")}`);
    err.code = "PLEIS_PAYOUT_CONFIG_INVALID";
    err.statusCode = 500;
    err.missing = missing;
    throw err;
  }
  if (locked === operating) {
    const err = new Error("payout_config_locked_equals_operating_iban");
    err.code = "PLEIS_PAYOUT_CONFIG_INVALID";
    err.statusCode = 500;
    throw err;
  }
  return cfg;
}

module.exports = {
  loadPleisPayoutConfig,
  assertPleisPayoutConfig,
};
