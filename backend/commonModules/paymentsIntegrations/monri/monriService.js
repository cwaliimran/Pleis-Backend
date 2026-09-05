const axios = require("axios");
const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const { createTransaction } = require("./monriRepository");

function buildAuthorizationHeader(body) {
  const fullpath = "/v2/terminal-entry/create-or-update";
  const timestamp = Date.now().toString(); // milliseconds



  const merchantKey = process.env.MONRI_KEY;
  const authToken = process.env.MONRI_AUTH_TOKEN;

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
    currency: "EUR",
    order_number: orderNumber,
    order_info: "Test payment",
    language: "en",
  };

  const body = JSON.stringify(bodyObject);
  const fullpath = "/v2/terminal-entry/create-or-update";

  const response = await axios.post(
    "https://ipgtest.monri.com" + fullpath,
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

function getMonriBaseUrl() {
  const configured = String(process.env.MONRI_BASE_URL || "").replace(/\/$/, "");
  if (configured) return configured;
  return "https://ipgtest.monri.com";
}

// Monri source of truth: GET /v2/transactions?order_number=
async function verifyTransaction(orderNumber) {
  const url = `${getMonriBaseUrl()}/v2/transactions`;
  const response = await axios.get(url, {
    params: { order_number: orderNumber },
    headers: {
      Accept: "application/json",
      Authorization: `key-${process.env.MONRI_AUTH_TOKEN}`,
    },
    timeout: 15000,
    validateStatus: () => true,
  });

  console.log(
    "[monri-verify] exact response:",
    JSON.stringify({
      orderNumber,
      url,
      httpStatus: response.status,
      statusText: response.statusText,
      data: response.data ?? null,
    }),
  );

  if (response.status !== 200) {
    const err = new Error(
      `Monri HTTP ${response.status}: ${JSON.stringify(response.data ?? null)}`,
    );
    err.code = "MONRI_BAD_RESPONSE";
    err.httpStatus = response.status;
    err.data = response.data ?? null;
    throw err;
  }

  const data = response.data;
  if (!data) return null;
  if (Array.isArray(data.transactions) && data.transactions.length) {
    return data.transactions[0];
  }
  if (data.transaction) return data.transaction;
  return null;
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
