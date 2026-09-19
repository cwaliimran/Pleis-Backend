/**
 * BillKO Imperial Lake API (Fiscalization 2.0 / B2B eInvoices).
 * Docs: https://app.billko.eu/api-docs/
 *
 * Separate from the retail /api-client used by billkoClient.js:
 * - Auth header: x-billko-lake-api-key
 * - Base: BILLKO_LAKE_BASE_URL (default https://app.billko.eu)
 *
 * Credentials (first match wins):
 * 1) BILLKO_LAKE_API_KEY
 * 2) Authenticate via BILLKO_LAKE_USERNAME + BILLKO_LAKE_PASSWORD + vatId
 *    (vatId = BILLKO_LAKE_VAT_ID || PLEIS_OIB)
 */

const axios = require("axios");

const DOCUMENT_STATUS = {
  Waiting: 1,
  Sending: 2,
  Sent: 3,
  Delivered: 4,
  Acknowledged: 5,
  Rejected: 6,
  Paid: 7,
  PartiallyPaid: 8,
  DeliveryFailed: 9,
};

/** eReporting payment types (Report Payment). */
const EREPORTING_PAYMENT_TYPE = {
  CreditTransfer: 1,
  ClearingBetweenPartners: 2,
  Other: 3,
};

let cachedLakeApiKey = null;
let cachedLakeApiKeySource = null;

function getLakeBaseUrl() {
  return String(
    process.env.BILLKO_LAKE_BASE_URL || "https://app.billko.eu",
  ).replace(/\/$/, "");
}

function isBillkoLakeEnabled() {
  const raw = String(process.env.BILLKO_LAKE_ENABLED ?? "false")
    .trim()
    .toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function getConfiguredLakeApiKey() {
  return String(process.env.BILLKO_LAKE_API_KEY || "").trim();
}

function getLakeAuthCredentials() {
  const username = String(process.env.BILLKO_LAKE_USERNAME || "").trim();
  const password = String(process.env.BILLKO_LAKE_PASSWORD || "").trim();
  const vatId = String(
    process.env.BILLKO_LAKE_VAT_ID || process.env.PLEIS_OIB || "",
  ).trim();
  return { username, password, vatId };
}

function hasLakeCredentials() {
  if (getConfiguredLakeApiKey()) return true;
  const { username, password, vatId } = getLakeAuthCredentials();
  return Boolean(username && password && vatId);
}

function clearLakeApiKeyCache() {
  cachedLakeApiKey = null;
  cachedLakeApiKeySource = null;
}

function sanitizeHeaders(headers) {
  if (!headers) return null;
  const plain =
    typeof headers.toJSON === "function" ? headers.toJSON() : { ...headers };
  const out = {};
  for (const [key, value] of Object.entries(plain)) {
    out[key] = ["x-billko-lake-api-key", "authorization", "cookie"].includes(
      String(key).toLowerCase(),
    )
      ? "[redacted]"
      : value;
  }
  return out;
}

function attachLakeError(error, details) {
  error.code = details.code || error.code || "BILLKO_LAKE_ERROR";
  error.statusCode = details.httpStatus || error.statusCode || 502;
  error.billkoHttpStatus = details.httpStatus;
  error.billkoResponse = details.responseData;
  error.billkoError = details;
  return error;
}

function wrapLakeAxiosError(error, context) {
  if (error?.billkoError) {
    console.error(`[billko-lake] ${context} error:`, JSON.stringify(error.billkoError));
    return error;
  }
  const response = error?.response;
  const status = response?.status;
  const data = response?.data;
  const message =
    data?.error ||
    data?.details ||
    data?.errorMessage ||
    error?.message ||
    `billko_lake_${context}_failed`;
  const details = {
    context,
    message,
    code:
      status === 401 || status === 403
        ? "BILLKO_LAKE_AUTH"
        : "BILLKO_LAKE_ERROR",
    httpStatus: status || null,
    statusText: response?.statusText || null,
    method: error?.config?.method || null,
    url: error?.config?.url || null,
    baseURL: error?.config?.baseURL || null,
    responseData: data ?? null,
    responseHeaders: sanitizeHeaders(response?.headers),
  };
  console.error(`[billko-lake] ${context} error:`, JSON.stringify(details));
  return attachLakeError(new Error(message), details);
}

function createLakeClient(apiKey) {
  if (!apiKey) {
    const error = new Error("billko_lake_api_key_missing");
    error.code = "BILLKO_LAKE_AUTH";
    error.statusCode = 400;
    throw error;
  }

  const client = axios.create({
    baseURL: getLakeBaseUrl(),
    headers: {
      Accept: "application/json",
      "x-billko-lake-api-key": apiKey,
    },
    timeout: 30000,
  });

  client.interceptors.request.use((config) => {
    const method = String(config.method || "get").toLowerCase();
    const hasBody = ["post", "put", "patch"].includes(method);
    const headers = config.headers || {};
    if (hasBody) {
      headers["Content-Type"] = "application/json";
    } else {
      if (typeof headers.delete === "function") {
        headers.delete("Content-Type");
      } else {
        delete headers["Content-Type"];
        delete headers["content-type"];
      }
      config.data = undefined;
    }
    config.headers = headers;
    return config;
  });

  return client;
}

async function authenticateLake({ username, password, vatId } = {}) {
  const creds = {
    username: username || getLakeAuthCredentials().username,
    password: password || getLakeAuthCredentials().password,
    vatId: vatId || getLakeAuthCredentials().vatId,
  };
  if (!creds.username || !creds.password || !creds.vatId) {
    const error = new Error("billko_lake_credentials_missing");
    error.code = "BILLKO_LAKE_AUTH";
    error.statusCode = 400;
    throw error;
  }

  try {
    const response = await axios.post(
      `${getLakeBaseUrl()}/imperial-lake-api/account/apikey`,
      {
        username: creds.username,
        password: creds.password,
        vatId: creds.vatId,
      },
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );
    const apiKey = response?.data?.apiKey;
    if (!apiKey) {
      const error = new Error("billko_lake_authenticate_no_key");
      error.code = "BILLKO_LAKE_AUTH";
      error.statusCode = 502;
      error.billkoResponse = response?.data ?? null;
      throw error;
    }
    cachedLakeApiKey = apiKey;
    cachedLakeApiKeySource = "authenticate";
    return apiKey;
  } catch (error) {
    throw wrapLakeAxiosError(error, "authenticate");
  }
}

async function resolveLakeApiKey({ forceRefresh = false } = {}) {
  const configured = getConfiguredLakeApiKey();
  if (configured) {
    cachedLakeApiKey = configured;
    cachedLakeApiKeySource = "env";
    return configured;
  }
  if (!forceRefresh && cachedLakeApiKey) return cachedLakeApiKey;
  return authenticateLake();
}

async function withLakeClient(fn, context) {
  let apiKey = await resolveLakeApiKey();
  try {
    return await fn(createLakeClient(apiKey));
  } catch (error) {
    const status = error?.billkoHttpStatus || error?.response?.status;
    const authFailed =
      status === 401 ||
      status === 403 ||
      String(error?.billkoResponse?.error || "")
        .toLowerCase()
        .includes("token");
    // Env keys cannot be refreshed via authenticate; only username/password path.
    if (authFailed && cachedLakeApiKeySource === "authenticate") {
      clearLakeApiKeyCache();
      apiKey = await resolveLakeApiKey({ forceRefresh: true });
      try {
        return await fn(createLakeClient(apiKey));
      } catch (retryError) {
        throw wrapLakeAxiosError(retryError, context);
      }
    }
    throw wrapLakeAxiosError(error, context);
  }
}

async function lakePing() {
  return withLakeClient(async (client) => {
    const response = await client.post("/imperial-lake-api/ping");
    return response.data;
  }, "ping");
}

async function getIncomingDocuments(params = {}) {
  return withLakeClient(async (client) => {
    const response = await client.get("/imperial-lake-api/document/incoming", {
      params,
    });
    return Array.isArray(response.data) ? response.data : response.data || [];
  }, "incoming_documents");
}

async function getOutgoingDocuments(params = {}) {
  return withLakeClient(async (client) => {
    const response = await client.get("/imperial-lake-api/document/outgoing", {
      params,
    });
    return Array.isArray(response.data) ? response.data : response.data || [];
  }, "outgoing_documents");
}

async function getDocumentStatus(documentId) {
  return withLakeClient(async (client) => {
    const response = await client.get(
      `/imperial-lake-api/document/status/${documentId}`,
    );
    return response.data;
  }, "document_status");
}

async function getDocumentXml(documentId) {
  return withLakeClient(async (client) => {
    const response = await client.get(
      `/imperial-lake-api/document/get/${documentId}`,
    );
    return response.data;
  }, "document_get");
}

/**
 * Report payment for an outgoing fiscalized invoice (seller side).
 * Body: { paymentDate: yyyy-MM-dd, paidAmount: number, paymentType: 1|2|3 }
 */
async function reportOutgoingPayment(documentId, body) {
  if (!documentId) {
    const error = new Error("billko_lake_document_id_required");
    error.code = "BILLKO_LAKE_DOCUMENT_ID";
    error.statusCode = 400;
    throw error;
  }
  const paymentDate = body?.paymentDate;
  const paidAmount = body?.paidAmount;
  const paymentType = body?.paymentType;
  if (!paymentDate || paidAmount == null || paymentType == null) {
    const error = new Error("billko_lake_report_payment_invalid");
    error.code = "BILLKO_LAKE_REPORT_PAYMENT_INVALID";
    error.statusCode = 400;
    throw error;
  }

  return withLakeClient(async (client) => {
    const response = await client.post(
      `/imperial-lake-api/ereporting/paid/${documentId}`,
      {
        paymentDate,
        paidAmount: Number(paidAmount),
        paymentType: Number(paymentType),
      },
    );
    return response.data ?? { ok: true };
  }, "report_payment");
}

module.exports = {
  DOCUMENT_STATUS,
  EREPORTING_PAYMENT_TYPE,
  getLakeBaseUrl,
  isBillkoLakeEnabled,
  hasLakeCredentials,
  clearLakeApiKeyCache,
  authenticateLake,
  resolveLakeApiKey,
  lakePing,
  getIncomingDocuments,
  getOutgoingDocuments,
  getDocumentStatus,
  getDocumentXml,
  reportOutgoingPayment,
};
