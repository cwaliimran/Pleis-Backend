/**
 * Monri Payments Module Generator
 * Absolute path – safe overwrite
 */

const fs = require("fs");
const path = require("path");

const BASE_DIR =
  "/Users/s/Desktop/Development/Projects/Pleis/Pleis-Backend/backend/commonModules/paymentsIntegrations/monri";

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const write = (file, content) => {
  fs.writeFileSync(file, content.trimStart(), "utf8");
  console.log("✅ Created:", file);
};

ensureDir(BASE_DIR);

/* ============================
   MonriTransaction.js
============================ */
write(
  path.join(BASE_DIR, "MonriTransaction.js"),
  `
const mongoose = require("mongoose");

const monriTransactionSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "EUR" },
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    approvalCode: String,
    rawCallback: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "MonriTransaction",
  monriTransactionSchema
);
`
);

/* ============================
   monriCrypto.js
============================ */
write(
  path.join(BASE_DIR, "monriCrypto.js"),
  `
const crypto = require("crypto");

const sign = ({ orderNumber, amount, currency }) => {
  return crypto
    .createHash("sha256")
    .update(
      orderNumber +
        amount +
        currency +
        process.env.MONRI_AUTH_TOKEN
    )
    .digest("hex");
};

const verify = ({ orderNumber, amount, currency, digest }) => {
  return digest === sign({ orderNumber, amount, currency });
};

module.exports = { sign, verify };
`
);

/* ============================
   monriRepository.js
============================ */
write(
  path.join(BASE_DIR, "monriRepository.js"),
  `
const MonriTransaction = require("./MonriTransaction");

const createTransaction = async (data) => {
  return MonriTransaction.create(data);
};

const findByOrderNumber = async (orderNumber) => {
  return MonriTransaction.findOne({ orderNumber });
};

const updateTransaction = async (orderNumber, data) => {
  return MonriTransaction.findOneAndUpdate(
    { orderNumber },
    data,
    { new: true }
  );
};

module.exports = {
  createTransaction,
  findByOrderNumber,
  updateTransaction,
};
`
);

/* ============================
   monriService.js
============================ */
write(
  path.join(BASE_DIR, "monriService.js"),
  `
const { v4: uuid } = require("uuid");
const repo = require("./monriRepository");
const { sign } = require("./monriCrypto");

const createPayment = async ({ amount }) => {
  const orderNumber = uuid();

  await repo.createTransaction({
    orderNumber,
    amount,
  });

  const payload = {
    merchant_id: process.env.MONRI_MERCHANT_ID,
    order_number: orderNumber,
    amount,
    currency: "EUR",
    transaction_type: "purchase",
  };

  payload.digest = sign({
    orderNumber,
    amount,
    currency: "EUR",
  });

  return {
    checkoutUrl: "https://ipgtest.monri.com/checkout",
    payload,
  };
};

const handleCallback = async (payload) => {
  const { order_number, approved, approval_code } = payload;

  const status =
    approved === true || approved === "true"
      ? "paid"
      : "failed";

  return repo.updateTransaction(order_number, {
    status,
    approvalCode: approval_code,
    rawCallback: payload,
  });
};

module.exports = {
  createPayment,
  handleCallback,
};
`
);

/* ============================
   monriController.js
============================ */
write(
  path.join(BASE_DIR, "monriController.js"),
  `
const {
  sendResponse,
  validateParams,
} = require("../../helperUtils/responseUtil");

const monriService = require("./monriService");
const { verify } = require("./monriCrypto");

const createPayment = async (req, res) => {
  if (!validateParams(req, res, { rawData: ["amount"] })) return;

  try {
    const session = await monriService.createPayment(req.body);

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "payment_session_created",
      data: session,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error,
    });
  }
};

const callback = async (req, res) => {
  const {
    order_number,
    amount,
    currency,
    digest,
  } = req.body;

  const valid = verify({
    orderNumber: order_number,
    amount,
    currency,
    digest,
  });

  if (!valid) {
    return res.status(400).send("INVALID_SIGNATURE");
  }

  await monriService.handleCallback(req.body);

  res.send("OK");
};

module.exports = {
  createPayment,
  callback,
};
`
);

/* ============================
   monriRoutes.js
============================ */
write(
  path.join(BASE_DIR, "monriRoutes.js"),
  `
const express = require("express");
const {
  createPayment,
  callback,
} = require("./monriController");

const router = express.Router();

router.post("/create", createPayment);
router.post("/callback", callback);

module.exports = router;
`
);

/* ============================
   index.js
============================ */
write(
  path.join(BASE_DIR, "index.js"),
  `
module.exports = {
  routes: require("./monriRoutes"),
};
`
);

console.log("\\n🎉 Monri module created (Categories-style compliant)");
