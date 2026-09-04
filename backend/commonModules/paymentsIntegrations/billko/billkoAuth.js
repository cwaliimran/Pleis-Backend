const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey() {
  const raw = process.env.BILLKO_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("BILLKO_ENCRYPTION_KEY is not configured");
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  return crypto.createHash("sha256").update(raw).digest();
}

function encryptSecret(plaintext) {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptSecret(payload) {
  if (!payload) return "";
  const key = getEncryptionKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

const BILLKO_READY_CACHE_NS = "billko:organizer-ready";

function invalidateOrganizerBillkoReadyCache(companyOrganizerId) {
  Promise.resolve()
    .then(() => {
      const { invalidate, buildKey } = require("@redisCache");
      const key = companyOrganizerId
        ? buildKey(BILLKO_READY_CACHE_NS, { id: String(companyOrganizerId) })
        : BILLKO_READY_CACHE_NS;
      return invalidate(key);
    })
    .catch(() => {});
}

function mergeCompanyBillkoKey(existing, incoming = {}, organizerId) {
  const nextEncrypted = incoming.billkoApiKey
    ? encryptSecret(incoming.billkoApiKey)
    : existing?.billkoApiKeyEncrypted || "";

  if (incoming.billkoApiKey) {
    invalidateOrganizerBillkoReadyCache(organizerId);
  }

  return {
    billkoApiKeyEncrypted: nextEncrypted,
    billkoKeyConfigured: Boolean(nextEncrypted),
  };
}

function stripBillkoSecrets(companyDetails) {
  if (!companyDetails || typeof companyDetails !== "object") {
    return companyDetails;
  }

  const {
    billkoApiKey,
    billkoApiKeyEncrypted,
    ...rest
  } = companyDetails;

  let decrypted = typeof billkoApiKey === "string" ? billkoApiKey : "";
  if (!decrypted && billkoApiKeyEncrypted) {
    try {
      decrypted = decryptSecret(billkoApiKeyEncrypted);
    } catch (_) {
      decrypted = "";
    }
  }

  return {
    ...rest,
    billkoApiKey: decrypted,
    billkoKeyConfigured: Boolean(
      companyDetails.billkoKeyConfigured || billkoApiKeyEncrypted || decrypted,
    ),
  };
}

module.exports = {
  encryptSecret,
  decryptSecret,
  mergeCompanyBillkoKey,
  stripBillkoSecrets,
  BILLKO_READY_CACHE_NS,
  invalidateOrganizerBillkoReadyCache,
};
