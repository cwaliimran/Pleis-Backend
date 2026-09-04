const axios = require("axios");

const BILLKO_ERROR_INVALID_KEY = "E01001";

function getBillkoBaseUrl() {
  return (
    process.env.BILLKO_BASE_URL ||
    (["prod", "production"].includes(String(process.env.NODE_ENV || "").toLowerCase())
      ? "https://billko.eu"
      : "https://test.billko.eu")
  );
}

function getCallbackUrl() {
  const base = (process.env.API_BASE_URL || "").replace(/\/?$/, "/");
  return `${base}webhooks/billko/callback`;
}

function createClient(apiKey) {
  if (!apiKey) {
    const error = new Error("billko_api_key_missing");
    error.code = BILLKO_ERROR_INVALID_KEY;
    error.statusCode = 400;
    throw error;
  }

  return axios.create({
    baseURL: `${getBillkoBaseUrl()}/api-client`,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-key": apiKey,
    },
    timeout: 30000,
  });
}

function sanitizeHeaders(headers) {
  if (!headers) return null;
  const plain = typeof headers.toJSON === "function" ? headers.toJSON() : { ...headers };
  const out = {};
  for (const [key, value] of Object.entries(plain)) {
    out[key] = ["x-api-key", "authorization", "cookie"].includes(String(key).toLowerCase())
      ? "[redacted]"
      : value;
  }
  return out;
}

function attachBillkoError(error, details) {
  error.code = details.code;
  error.statusCode = details.httpStatus || error.statusCode || 502;
  error.billkoHttpStatus = details.httpStatus;
  error.billkoResponse = details.responseData;
  error.billkoError = details;
  return error;
}

function billkoErrorDetails(error) {
  if (error?.billkoError) return error.billkoError;
  const response = error?.response;
  return {
    message: error?.message || String(error),
    code: error?.code || null,
    httpStatus: error?.billkoHttpStatus || error?.statusCode || response?.status || null,
    statusText: response?.statusText || null,
    method: error?.config?.method || response?.config?.method || null,
    url: error?.config?.url || response?.config?.url || null,
    baseURL: error?.config?.baseURL || response?.config?.baseURL || null,
    responseData: error?.billkoResponse ?? response?.data ?? null,
    responseHeaders: sanitizeHeaders(response?.headers),
  };
}

function unwrapResult(response, context) {
  const data = response?.data;
  if (!data || data.hasErrors === true || !data.result) {
    const error = new Error(
      data?.errorMessage ||
        data?.errors?.[0]?.message ||
        `billko_${context}_failed`,
    );
    attachBillkoError(error, {
      context,
      message: error.message,
      code: data?.errorCode || data?.errors?.[0]?.code || "BILLKO_ERROR",
      httpStatus: response?.status || 502,
      statusText: response?.statusText || null,
      method: response?.config?.method || null,
      url: response?.config?.url || null,
      baseURL: response?.config?.baseURL || null,
      responseData: data ?? null,
      responseHeaders: sanitizeHeaders(response?.headers),
    });
    throw error;
  }
  return data.result;
}

function wrapAxiosError(error, context) {
  if (error?.billkoError) {
    console.error(`[billko] ${context} error:`, JSON.stringify(error.billkoError));
    return error;
  }
  const response = error?.response;
  const status = response?.status;
  const data = response?.data;
  const message =
    data?.errorMessage ||
    data?.errors?.[0]?.message ||
    data?.title ||
    error?.message ||
    `billko_${context}_failed`;
  const details = {
    context,
    message,
    code:
      data?.errorCode ||
      data?.errors?.[0]?.code ||
      error?.code ||
      (status === 401 || status === 403 ? BILLKO_ERROR_INVALID_KEY : "BILLKO_ERROR"),
    httpStatus: status || null,
    statusText: response?.statusText || null,
    method: error?.config?.method || response?.config?.method || null,
    url: error?.config?.url || response?.config?.url || null,
    baseURL: error?.config?.baseURL || response?.config?.baseURL || null,
    responseData: data ?? null,
    responseHeaders: sanitizeHeaders(response?.headers),
  };
  console.error(`[billko] ${context} error:`, JSON.stringify(details));
  return attachBillkoError(new Error(message), details);
}

async function createInvoice(apiKey, payload) {
  try {
    const client = createClient(apiKey);
    const response = await client.post("/invoices", payload);
    return unwrapResult(response, "create_invoice");
  } catch (error) {
    throw wrapAxiosError(error, "create_invoice");
  }
}

async function listInvoices(apiKey, params = {}) {
  try {
    const client = createClient(apiKey);
    const response = await client.get("/invoices", { params });
    return unwrapResult(response, "list_invoices");
  } catch (error) {
    throw wrapAxiosError(error, "list_invoices");
  }
}

async function getInvoiceById(apiKey, invoiceId) {
  try {
    const client = createClient(apiKey);
    const response = await client.get(`/invoices/${invoiceId}`);
    return unwrapResult(response, "get_invoice");
  } catch (error) {
    throw wrapAxiosError(error, "get_invoice");
  }
}

async function findInvoicesByOrderNumber(apiKey, orderNumber) {
  const result = await listInvoices(apiKey, { orderNumber });
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (result) return [result];
  return [];
}

async function refundInvoice(apiKey, payload) {
  try {
    const client = createClient(apiKey);
    const response = await client.post("/invoices/refund", payload);
    return unwrapResult(response, "refund_invoice");
  } catch (error) {
    throw wrapAxiosError(error, "refund_invoice");
  }
}

function isInvalidApiKeyError(error) {
  const status = error?.billkoHttpStatus || error?.statusCode;
  return (
    error?.code === BILLKO_ERROR_INVALID_KEY ||
    status === 401 ||
    status === 403 ||
    String(error?.billkoResponse?.errorCode || "").includes(BILLKO_ERROR_INVALID_KEY)
  );
}

module.exports = {
  BILLKO_ERROR_INVALID_KEY,
  getBillkoBaseUrl,
  getCallbackUrl,
  createInvoice,
  listInvoices,
  getInvoiceById,
  findInvoicesByOrderNumber,
  refundInvoice,
  isInvalidApiKeyError,
  billkoErrorDetails,
};
