const mongoose = require("mongoose");
const LegalDocument = require("./LegalDocument");
const ConsentLog = require("./ConsentLog");
const {
  LEGAL_DOCUMENT_TYPES,
  CONSENT_ACTIONS,
  DOCUMENT_TITLES,
  LEGACY_SETTINGS_FIELD,
  REQUIRED_DOCUMENTS_BY_USER_TYPE,
} = require("./legalConstants");
const { cache, invalidate } = require("../../config/redis/redisCache");

const LATEST_CACHE_NS = "legal:latest:v1";
const DOC_TYPES = Object.values(LEGAL_DOCUMENT_TYPES);

const AdminSettings = () => require("../../admin/settings/models/AdminSettings");
const UserModel = () => require("../../models/UserModel").User;

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

/**
 * First run: create version 1 of each document from the legacy AdminSettings text,
 * so existing content becomes the baseline everyone is measured against.
 */
let seeded = false;
const ensureSeeded = async () => {
  if (seeded) return;
  const existing = await LegalDocument.distinct("type");
  const missing = DOC_TYPES.filter((t) => !existing.includes(t));
  if (missing.length) {
    const settings = await AdminSettings().findOne({}).lean();
    for (const type of missing) {
      const content = settings?.[LEGACY_SETTINGS_FIELD[type]] || "";
      try {
        await LegalDocument.create({
          type,
          version: 1,
          content,
          summary: "Initial version",
          effectiveDate: settings?.updatedAt || new Date(),
        });
      } catch (e) {
        if (e?.code !== 11000) throw e; // another instance seeded it first
      }
    }
  }
  seeded = true;
};

const toPublic = (doc) =>
  doc && {
    _id: doc._id,
    type: doc.type,
    title: DOCUMENT_TITLES[doc.type],
    version: doc.version,
    content: doc.content,
    summary: doc.summary,
    effectiveDate: doc.effectiveDate,
    requiresReacceptance: doc.requiresReacceptance,
    publishedAt: doc.createdAt,
  };

const findLatestDirect = async (type) => {
  await ensureSeeded();
  return LegalDocument.findOne({ type }).sort({ version: -1 }).lean();
};

/** Latest version of a document (any change). Cached 1 day, busted on publish. */
const getLatestDocument = async (type) =>
  cache({
    namespace: `${LATEST_CACHE_NS}:${type}`,
    ttl: 86400,
    fetchFn: async () => toPublic(await findLatestDirect(type)),
  });

const getLatestDocuments = async (types = DOC_TYPES) => {
  const docs = await Promise.all(types.map(getLatestDocument));
  return docs.filter(Boolean);
};

/**
 * Highest version of `type` that users must (re-)accept. A user who accepted this
 * version or anything newer is up to date.
 */
const getMinimumAcceptableVersion = async (type) => {
  await ensureSeeded();
  const doc = await LegalDocument.findOne({ type, requiresReacceptance: true })
    .sort({ version: -1 })
    .select("version")
    .lean();
  return doc?.version || 1;
};

const getDocumentHistory = async (type) => {
  await ensureSeeded();
  const rows = await LegalDocument.find({ type })
    .sort({ version: -1 })
    .populate("publishedBy", "firstName lastName email")
    .lean();
  return rows.map((r) => ({ ...toPublic(r), publishedBy: r.publishedBy || null }));
};

/** Publish a new version (admin). Mirrors the text into legacy AdminSettings fields. */
const publishDocument = async ({ type, content, summary = "", effectiveDate, requiresReacceptance = true, publishedBy }) => {
  if (!DOC_TYPES.includes(type)) {
    const err = new Error("invalid_legal_document_type");
    err.statusCode = 400;
    throw err;
  }
  await ensureSeeded();
  const latest = await LegalDocument.findOne({ type }).sort({ version: -1 }).lean();
  const doc = await LegalDocument.create({
    type,
    version: (latest?.version || 0) + 1,
    content: content || "",
    summary,
    effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
    requiresReacceptance: requiresReacceptance !== false,
    publishedBy: publishedBy || null,
  });

  // Keep legacy readers (/settings/terms-conditions, /settings/privacy-policy, …) in sync.
  const field = LEGACY_SETTINGS_FIELD[type];
  await AdminSettings().updateOne({}, { $set: { [field]: doc.content } }, { upsert: true });
  await Promise.all([
    invalidate(`${LATEST_CACHE_NS}:${type}`),
    invalidate("adminSettings:active"),
  ]);
  return toPublic(doc.toObject());
};

/* ------------------------------------------------------------------ */
/* Consent                                                             */
/* ------------------------------------------------------------------ */

/** Audit metadata from the request (ip / device / platform). */
const requestMeta = (req = {}) => {
  const body = req.body || {};
  const headers = req.headers || {};
  const deviceType = body.deviceType || headers["x-device-type"] || null;
  const ua = headers["user-agent"] || "";
  const platform =
    body.platform ||
    headers["x-platform"] ||
    (deviceType ? String(deviceType).toLowerCase() : null) ||
    (/okhttp|Android/i.test(ua) ? "android" : /CFNetwork|Darwin|iPhone|iOS/i.test(ua) ? "ios" : /Mozilla/i.test(ua) ? "web" : null);
  return {
    ip: req.ip || headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || null,
    userAgent: headers["user-agent"] || null,
    device: { deviceId: body.deviceId || headers["x-device-id"] || null, deviceType },
    platform,
  };
};

const subjectTypeFor = (userType) => (userType === "organizer" ? "partner" : "user");

/** Append one consent record. Never updates existing rows. */
const logConsent = async ({ userId, userType, documentType, action = CONSENT_ACTIONS.ACCEPTED, document = null, documentVersion, context = {}, meta = {}, session }) => {
  const [row] = await ConsentLog.create(
    [
      {
        user: userId,
        subjectType: subjectTypeFor(userType),
        documentType,
        action,
        document,
        documentVersion: String(documentVersion),
        acceptedAt: new Date(),
        context,
        ip: meta.ip || null,
        userAgent: meta.userAgent || null,
        device: meta.device || {},
        platform: meta.platform || null,
      },
    ],
    session ? { session } : undefined
  );
  return row;
};

const requiredTypesFor = (userType) => REQUIRED_DOCUMENTS_BY_USER_TYPE[userType] || [];

/**
 * Which required documents the user still has to (re-)accept.
 * Returns full latest documents so the client can render the prompt directly.
 */
const getLegalStatus = async (user) => {
  const userType = user?.accountState?.userType || user?.userType;
  const types = requiredTypesFor(userType);
  if (!types.length) return { userType, required: [], pending: [], upToDate: true };

  const fresh = await UserModel().findById(user._id).select("legalAcceptances").lean();
  const accepted = fresh?.legalAcceptances || {};

  const pending = [];
  for (const type of types) {
    const [latest, minVersion] = await Promise.all([getLatestDocument(type), getMinimumAcceptableVersion(type)]);
    const acceptedVersion = Number(accepted?.[type]?.version) || 0;
    if (acceptedVersion < minVersion) {
      pending.push({ ...latest, acceptedVersion: acceptedVersion || null, isReacceptance: acceptedVersion > 0 });
    }
  }
  return { userType, required: types, pending, upToDate: pending.length === 0 };
};

/**
 * Record acceptance of the given documents. `acceptances` = [{ type, version? }].
 * The version must be the current latest one (clients send what they displayed; if
 * omitted the latest is assumed). Logs each acceptance and updates the user's
 * denormalised `legalAcceptances` snapshot used for gating.
 */
const acceptDocuments = async ({ user, acceptances = [], source = "reacceptance", req, session, extraContext = {} }) => {
  const userType = user?.accountState?.userType || user?.userType;
  const meta = requestMeta(req);
  const set = {};
  const logged = [];

  for (const item of acceptances) {
    const type = typeof item === "string" ? item : item?.type;
    if (!DOC_TYPES.includes(type)) {
      const err = new Error("invalid_legal_document_type");
      err.statusCode = 400;
      throw err;
    }
    const latest = await findLatestDirect(type);
    const requested = item?.version != null ? Number(item.version) : latest.version;
    if (requested !== latest.version) {
      const err = new Error("legal_document_version_outdated");
      err.statusCode = 409;
      err.data = { type, latestVersion: latest.version };
      throw err;
    }
    const row = await logConsent({
      userId: user._id,
      userType,
      documentType: type,
      document: latest._id,
      documentVersion: latest.version,
      context: { source, ...extraContext },
      meta,
      session,
    });
    logged.push(row);
    set[`legalAcceptances.${type}`] = { version: latest.version, document: latest._id, acceptedAt: row.acceptedAt };
  }

  if (Object.keys(set).length) {
    // Partners: keep the legacy flag the dashboard already reads.
    if (userType === "organizer") {
      const fresh = await UserModel().findById(user._id).select("legalAcceptances").lean();
      const merged = { ...(fresh?.legalAcceptances || {}) };
      Object.entries(set).forEach(([k, v]) => (merged[k.split(".")[1]] = v));
      const done = await Promise.all(
        requiredTypesFor("organizer").map(async (t) => (Number(merged[t]?.version) || 0) >= (await getMinimumAcceptableVersion(t)))
      );
      if (done.every(Boolean)) set.termsAccepted = true;
    }
    await UserModel().updateOne({ _id: user._id }, { $set: set }, session ? { session } : undefined);
  }
  return logged;
};

/**
 * Validate registration-time acceptance. `legalAcceptance` may be
 *   { termsOfUse: true, privacyPolicy: true }  or  [{ type, version }]  or  { terms_of_use: 3, ... }.
 * Returns normalised [{ type, version? }] or null when something required is missing.
 */
const KEY_ALIASES = {
  termsOfUse: "terms_of_use",
  terms_of_use: "terms_of_use",
  privacyPolicy: "privacy_policy",
  privacy_policy: "privacy_policy",
  partnerTerms: "partner_terms",
  partner_terms: "partner_terms",
  salesTerms: "sales_terms",
  sales_terms: "sales_terms",
};
const normalizeAcceptance = (legalAcceptance, userType) => {
  const required = requiredTypesFor(userType);
  if (!required.length) return [];
  let items = [];
  if (Array.isArray(legalAcceptance)) {
    items = legalAcceptance
      .map((i) => (typeof i === "string" ? { type: KEY_ALIASES[i] || i } : { type: KEY_ALIASES[i?.type] || i?.type, version: i?.version }))
      .filter((i) => i.type);
  } else if (legalAcceptance && typeof legalAcceptance === "object") {
    items = Object.entries(legalAcceptance)
      .filter(([, v]) => v === true || v === "true" || typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v)))
      .map(([k, v]) => ({ type: KEY_ALIASES[k] || k, ...(v === true || v === "true" ? {} : { version: Number(v) }) }));
  }
  const byType = new Map(items.map((i) => [i.type, i]));
  if (!required.every((t) => byType.has(t))) return null;
  return required.map((t) => byType.get(t));
};

/** Throws 409 if a client accepted a version that is no longer the latest. */
const assertLatestVersions = async (items = []) => {
  for (const item of items) {
    if (item?.version == null) continue;
    const latest = await findLatestDirect(item.type);
    if (Number(item.version) !== latest.version) {
      const err = new Error("legal_document_version_outdated");
      err.statusCode = 409;
      err.data = { type: item.type, latestVersion: latest.version };
      throw err;
    }
  }
};

const isObjectId = (v) => mongoose.Types.ObjectId.isValid(v);

module.exports = {
  ensureSeeded,
  getLatestDocument,
  getLatestDocuments,
  getMinimumAcceptableVersion,
  getDocumentHistory,
  publishDocument,
  requestMeta,
  logConsent,
  getLegalStatus,
  acceptDocuments,
  normalizeAcceptance,
  assertLatestVersions,
  requiredTypesFor,
  isObjectId,
};
