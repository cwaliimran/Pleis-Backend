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

function unwrapResult(response, context) {
  const data = response?.data;
  if (!data || data.hasErrors === true || !data.result) {
    const error = new Error(
      data?.errorMessage ||
        data?.errors?.[0]?.message ||
        `billko_${context}_failed`,
    );
    error.code = data?.errorCode || data?.errors?.[0]?.code || "BILLKO_ERROR";
    error.statusCode = 502;
    error.billkoResponse = data;
    throw error;
  }
  return data.result;
}

async function createInvoice(apiKey, payload) {
  const client = createClient(apiKey);
  const response = await client.post("/invoices", payload);
  return unwrapResult(response, "create_invoice");
}

async function listInvoices(apiKey, params = {}) {
  const client = createClient(apiKey);
  const response = await client.get("/invoices", { params });
  return unwrapResult(response, "list_invoices");
}

async function getInvoiceById(apiKey, invoiceId) {
  const client = createClient(apiKey);
  const response = await client.get(`/invoices/${invoiceId}`);
  return unwrapResult(response, "get_invoice");
}

async function findInvoicesByOrderNumber(apiKey, orderNumber) {
  const result = await listInvoices(apiKey, { orderNumber });
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  if (result) return [result];
  return [];
}

async function refundInvoice(apiKey, payload) {
  const client = createClient(apiKey);
  const response = await client.post("/invoices/refund", payload);
  return unwrapResult(response, "refund_invoice");
}

function isInvalidApiKeyError(error) {
  return (
    error?.code === BILLKO_ERROR_INVALID_KEY ||
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
};
