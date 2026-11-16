const axios = require("axios");
const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const { createTransaction } = require("./monriRepository");
const {
  getMonriBaseUrl,
  getMonriKey,
  getMonriAuthToken,
  getMonriCurrency,
  getMonriLanguage,
} = require("./monriEnv");

function buildAuthorizationHeader(body) {
  const fullpath = "/v2/terminal-entry/create-or-update";
  const timestamp = Date.now().toString(); // milliseconds



  const merchantKey = getMonriKey();
  const authToken = getMonriAuthToken();

  const digest = crypto
    .createHash("sha512")
    .update(
      merchantKey +
      timestamp +
      authToken +
      "/v2/terminal-entry/create-or-update" +
      JSON.stringify(body)
    )
    .digest("hex");

  const authorization = `WP3-v2.1 ${merchantKey}:${timestamp}:${digest}`;


  return authorization;
}

async function createPayByLink(amount) {
  if (typeof amount !== "number" || isNaN(amount)) {
    throw new Error("Invalid amount");
  }

  const orderNumber = uuid();
  const amountMinor = Math.round(amount * 100);

  const bodyObject = {
    transaction_type: "purchase",
    amount: amountMinor,
    currency: getMonriCurrency(),
    order_number: orderNumber,
    order_info: "Test payment",
    language: getMonriLanguage(),
  };

  const body = JSON.stringify(bodyObject);
  const fullpath = "/v2/terminal-entry/create-or-update";

  const response = await axios.post(
    getMonriBaseUrl() + fullpath,
    body,
    {
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: buildAuthorizationHeader({ body, fullpath }),
      },
    }
  );

  return response.data;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The order's own fields from an /orders/show reply, as a flat object with
 * Monri's JSON names (approval-code → approval_code). Nested blocks
 * (custom-attributes: card BIN, 3DS, URLs) are left out.
 */
function parseMonriOrderXml(xml) {
  const body = String(xml || "").replace(
    /<custom-attributes[\s\S]*?<\/custom-attributes>/,
    "",
  );
  const order = {};
  const field = /<([a-z][a-z0-9-]*)((?:\s[^>]*)?)(?:\/>|>([^<]*)<\/\1>)/gi;
  let match;
  while ((match = field.exec(body))) {
    const [, tag, attrs, text] = match;
    if (tag === "order" || tag === "masked-pan") continue;
    const key = tag.replace(/-/g, "_");
    if (/nil="true"/.test(attrs) || text == null) order[key] = null;
    else if (/type="integer"/.test(attrs)) order[key] = Number(text);
    else order[key] = text.trim();
  }
  return order;
}

/**
 * Monri source of truth (#10, #25; Monri v1.4 §3.2 server-side status query):
 * POST {base}/orders/show with the order number, the merchant's authenticity
 * token and digest = SHA1(key + order_number).
 *
 * Returns the order's fields ({ status: "approved", amount, currency,
 * approval_code, response_code, … }), or null when Monri has no approved
 * payment for this order number (not paid yet, abandoned or declined).
 * Throws MONRI_BAD_RESPONSE for anything else (bad digest, HTTP error).
 */
async function verifyTransaction(orderNumber) {
  const url = `${getMonriBaseUrl()}/orders/show`;
  const digest = crypto
    .createHash("sha1")
    .update(getMonriKey() + orderNumber)
    .digest("hex");
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<order>" +
    `<order-number>${escapeXml(orderNumber)}</order-number>` +
    `<authenticity-token>${escapeXml(getMonriAuthToken())}</authenticity-token>` +
    `<digest>${digest}</digest>` +
    "</order>";

  const response = await axios.post(url, xml, {
    headers: { "Content-Type": "application/xml", Accept: "application/xml" },
    timeout: 15000,
    responseType: "text",
    validateStatus: () => true,
  });

  const order = response.status === 200 ? parseMonriOrderXml(response.data) : null;

  console.log(
    "[monri-verify]",
    JSON.stringify({
      orderNumber,
      httpStatus: response.status,
      status: order?.status ?? null,
      amount: order?.amount ?? null,
      currency: order?.currency ?? null,
      error: order?.error ?? null,
    }),
  );

  if (order && !order.error) return order;

  // Monri answers "order number … not approved" when it holds no approved
  // payment for the order: nothing has been charged (yet).
  if (order?.error && /not approved/i.test(order.error)) return null;

  const err = new Error(
    `Monri HTTP ${response.status}: ${order?.error || String(response.data ?? "").slice(0, 300)}`,
  );
  err.code = "MONRI_BAD_RESPONSE";
  err.httpStatus = response.status;
  err.data = order?.error || null;
  throw err;
}



const createTransactionMonriOrder = async (req, res) => {
  try {

    const result = await createTransaction({
      orderNumber: crypto.randomUUID(),
      amount: 500,
    })
    return result;

  } catch (err) {
    
  }
};


module.exports = {
  createPayByLink,
  verifyTransaction,
  createTransactionMonriOrder,
  getMonriBaseUrl,
};
