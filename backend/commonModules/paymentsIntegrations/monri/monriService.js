const axios = require("axios");
const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const { createTransaction } = require("./monriRepository");

function buildAuthorizationHeader(body) {
  const fullpath = "/v2/terminal-entry/create-or-update";
  const timestamp = Date.now().toString(); // milliseconds
  console.log("MONRI_KEY:", process.env.MONRI_KEY);
  console.log("MONRI_AUTH_TOKEN:", process.env.MONRI_AUTH_TOKEN);



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

async function verifyTransaction(orderNumber) {
  const response = await axios.get(
    "https://ipgtest.monri.com/v2/transactions",
    {
      params: { order_number: orderNumber },
      headers: {
        Authorization: `key-${process.env.MONRI_AUTH_TOKEN}`,
      },
    }
  );

  if (!response.data?.transactions?.length) {
    throw new Error("Transaction not found");
  }

  return response.data.transactions[0];
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


module.exports = { createPayByLink, verifyTransaction, createTransactionMonriOrder };
