const { sendResponse, parsePaginationParams, generateMeta } = require("../../helperUtils/responseUtil");
const legalService = require("./legalService");
const ConsentLog = require("./ConsentLog");
const { LEGAL_DOCUMENT_TYPES, CONSENT_TYPES } = require("./legalConstants");

const DOC_TYPES = Object.values(LEGAL_DOCUMENT_TYPES);

const fail = (res, error) =>
  sendResponse({
    res,
    statusCode: error.statusCode || 500,
    translationKey: error.message,
    data: error.data || null,
    error,
  });

/* ---------------- public ---------------- */

// GET /legal/documents?types=terms_of_use,privacy_policy
const getDocuments = async (req, res) => {
  try {
    const types = req.query.types
      ? String(req.query.types).split(",").map((t) => t.trim()).filter((t) => DOC_TYPES.includes(t))
      : DOC_TYPES;
    const data = await legalService.getLatestDocuments(types);
    return sendResponse({ res, statusCode: 200, translationKey: "legal_documents_fetched", data });
  } catch (error) {
    return fail(res, error);
  }
};

// GET /legal/documents/:type
const getDocument = async (req, res) => {
  const { type } = req.params;
  if (!DOC_TYPES.includes(type)) {
    return sendResponse({ res, statusCode: 400, translationKey: "invalid_legal_document_type" });
  }
  try {
    const data = await legalService.getLatestDocument(type);
    if (!data) return sendResponse({ res, statusCode: 404, translationKey: "legal_document_not_found" });
    return sendResponse({ res, statusCode: 200, translationKey: "legal_document_fetched", data });
  } catch (error) {
    return fail(res, error);
  }
};

/* ---------------- authenticated ---------------- */

// GET /legal/status — what the signed-in account still has to (re-)accept
const getStatus = async (req, res) => {
  try {
    const data = await legalService.getLegalStatus(req.user);
    return sendResponse({ res, statusCode: 200, translationKey: "legal_status_fetched", data });
  } catch (error) {
    return fail(res, error);
  }
};

// POST /legal/accept { acceptances: [{ type, version }], context? }
const accept = async (req, res) => {
  const { acceptances } = req.body || {};
  if (!Array.isArray(acceptances) || !acceptances.length) {
    return sendResponse({ res, statusCode: 400, translationKey: "acceptances_required" });
  }
  try {
    await legalService.acceptDocuments({ user: req.user, acceptances, source: "reacceptance", req });
    const data = await legalService.getLegalStatus(req.user);
    return sendResponse({ res, statusCode: 200, translationKey: "legal_documents_accepted", data });
  } catch (error) {
    return fail(res, error);
  }
};

/* ---------------- admin ---------------- */

// GET /admin/legal-documents — latest of each type
const adminGetDocuments = async (req, res) => {
  try {
    const data = await legalService.getLatestDocuments(DOC_TYPES);
    return sendResponse({ res, statusCode: 200, translationKey: "legal_documents_fetched", data });
  } catch (error) {
    return fail(res, error);
  }
};

// GET /admin/legal-documents/:type/history
const adminGetHistory = async (req, res) => {
  const { type } = req.params;
  if (!DOC_TYPES.includes(type)) {
    return sendResponse({ res, statusCode: 400, translationKey: "invalid_legal_document_type" });
  }
  try {
    const data = await legalService.getDocumentHistory(type);
    return sendResponse({ res, statusCode: 200, translationKey: "legal_document_history_fetched", data });
  } catch (error) {
    return fail(res, error);
  }
};

// POST /admin/legal-documents { type, content, summary, effectiveDate, requiresReacceptance }
const adminPublish = async (req, res) => {
  const { type, content, summary, effectiveDate, requiresReacceptance } = req.body || {};
  if (!DOC_TYPES.includes(type)) {
    return sendResponse({ res, statusCode: 400, translationKey: "invalid_legal_document_type" });
  }
  if (!content || !String(content).replace(/<[^>]*>/g, "").trim()) {
    return sendResponse({ res, statusCode: 400, translationKey: "legal_document_content_required" });
  }
  if (effectiveDate && Number.isNaN(new Date(effectiveDate).getTime())) {
    return sendResponse({ res, statusCode: 400, translationKey: "invalid_effective_date" });
  }
  try {
    const data = await legalService.publishDocument({
      type,
      content,
      summary,
      effectiveDate,
      requiresReacceptance: requiresReacceptance !== false && requiresReacceptance !== "false",
      publishedBy: req.user?._id,
    });
    return sendResponse({ res, statusCode: 201, translationKey: "legal_document_published", data });
  } catch (error) {
    return fail(res, error);
  }
};

// GET /admin/legal-documents/consent-logs?user=&documentType=&page=&limit=
const adminGetConsentLogs = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req);
    const filter = {};
    if (req.query.user && legalService.isObjectId(req.query.user)) filter.user = req.query.user;
    if (req.query.documentType && Object.values(CONSENT_TYPES).includes(req.query.documentType)) {
      filter.documentType = req.query.documentType;
    }
    if (req.query.clubId && legalService.isObjectId(req.query.clubId)) filter["context.clubId"] = req.query.clubId;
    const [rows, total] = await Promise.all([
      ConsentLog.find(filter)
        .sort({ acceptedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "firstName lastName email accountState.userType")
        .lean(),
      ConsentLog.countDocuments(filter),
    ]);
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "consent_logs_fetched",
      data: rows,
      meta: generateMeta(page, limit, total),
    });
  } catch (error) {
    return fail(res, error);
  }
};

module.exports = {
  getDocuments,
  getDocument,
  getStatus,
  accept,
  adminGetDocuments,
  adminGetHistory,
  adminPublish,
  adminGetConsentLogs,
};
