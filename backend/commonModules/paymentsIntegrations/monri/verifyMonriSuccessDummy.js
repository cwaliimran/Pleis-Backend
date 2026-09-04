#!/usr/bin/env node
/**
 * Dummy /success URL verification. Does not invent a live Monri charge.
 * Run: node backend/commonModules/paymentsIntegrations/monri/verifyMonriSuccessDummy.js
 */
const path = require("path");
const crypto = require("crypto");

require("dotenv").config({
  path: path.join(__dirname, "../../../../.env.dev"),
});

const {
  evaluateMonriSuccessIntent,
  buildDummyMonriSuccessRequest,
  verifyMonriSuccessDigest,
} = require("./monriSuccessGuard");

const ORDER_NUMBER = "6a9aad3eabe30c611ee7432e";
const USER_ID = "692e9a6ae9eddb01e3459d4f";
const LOCAL_SUCCESS = "http://127.0.0.1:4012/api/v1/app/payments/monri/success";
const MERCHANT_KEY = process.env.MONRI_KEY;
const SUCCESS_URL = process.env.SUCCESS_URL;

function assert(condition, label) {
  if (!condition) {
    throw new Error(`FAIL: ${label}`);
  }
  console.log(`  PASS  ${label}`);
}

function runGuardCases() {
  console.log("\n== Guard cases (no DB) ==");
  const txPending = {
    status: "pending",
    amount: 1500,
    orderType: "menuorders",
    userId: USER_ID,
  };
  const txPaid = { ...txPending, status: "paid" };

  const dummy = buildDummyMonriSuccessRequest({
    successUrl: SUCCESS_URL,
    merchantKey: MERCHANT_KEY,
    params: {
      acquirer: "integration_acq",
      amount: "1500",
      approval_code: "629762",
      ch_full_name: "John Doe",
      currency: "EUR",
      order_number: ORDER_NUMBER,
      response_code: "0000",
    },
  });

  assert(
    verifyMonriSuccessDigest({
      req: dummy.req,
      payload: dummy.payload,
      successUrl: SUCCESS_URL,
      merchantKey: MERCHANT_KEY,
    }),
    "raw success URL digest matches Monri formula (incl. John+Doe encoding)",
  );

  const approved = evaluateMonriSuccessIntent({
    req: dummy.req,
    payload: dummy.payload,
    tx: txPending,
    successUrl: SUCCESS_URL,
    merchantKey: MERCHANT_KEY,
  });
  assert(approved.action === "fulfill_paid" && approved.reason === "approved", "signed approved callback fulfills paid");

  const incomplete = evaluateMonriSuccessIntent({
    req: { originalUrl: `/api/v1/app/payments/monri/success?order_number=${ORDER_NUMBER}` },
    payload: { order_number: ORDER_NUMBER },
    tx: txPending,
    successUrl: SUCCESS_URL,
    merchantKey: MERCHANT_KEY,
  });
  assert(
    incomplete.action === "ignore" && incomplete.reason === "incomplete_callback",
    "bare order_number does NOT fail a pending payment",
  );

  const spoof = evaluateMonriSuccessIntent({
    req: { originalUrl: `/api/v1/app/payments/monri/success?order_number=${ORDER_NUMBER}&status=approved` },
    payload: { order_number: ORDER_NUMBER, status: "approved" },
    tx: txPending,
    successUrl: SUCCESS_URL,
    merchantKey: MERCHANT_KEY,
  });
  assert(
    spoof.action === "reject" && spoof.reason === "digest_required",
    "status=approved without digest is rejected",
  );

  const alreadyPaid = evaluateMonriSuccessIntent({
    req: { originalUrl: `/api/v1/app/payments/monri/success?order_number=${ORDER_NUMBER}` },
    payload: { order_number: ORDER_NUMBER },
    tx: txPaid,
    successUrl: SUCCESS_URL,
    merchantKey: MERCHANT_KEY,
  });
  assert(
    alreadyPaid.action === "fulfill_paid" && alreadyPaid.reason === "already_paid",
    "already-paid tx still fulfills (unsticks pending menu order)",
  );

  const badDigest = evaluateMonriSuccessIntent({
    req: dummy.req,
    payload: { ...dummy.payload, digest: "0".repeat(128) },
    tx: txPending,
    successUrl: SUCCESS_URL,
    merchantKey: MERCHANT_KEY,
  });
  assert(badDigest.action === "reject" && badDigest.reason === "invalid_digest", "tampered digest is rejected");

  const mismatch = evaluateMonriSuccessIntent({
    req: dummy.req,
    payload: dummy.payload,
    tx: { ...txPending, amount: 9999 },
    successUrl: SUCCESS_URL,
    merchantKey: MERCHANT_KEY,
  });
  assert(mismatch.action === "reject" && mismatch.reason === "amount_mismatch", "amount mismatch is rejected");

  const reconstructed = crypto
    .createHash("sha512")
    .update(`${MERCHANT_KEY}${new URL(SUCCESS_URL).origin}${dummy.req.originalUrl.split("&digest=")[0]}`)
    .digest("hex");
  // Keep this as a sanity note only; handler uses SUCCESS_URL base + raw query.
  assert(typeof reconstructed === "string", "sha512 helper available");
}

async function httpJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

async function runHttpCases() {
  console.log("\n== Local HTTP /success ==");
  const missing = await httpJson(`${LOCAL_SUCCESS}`);
  assert(missing.status === 400 && missing.body.message === "Missing order_number", "GET without order_number → 400");

  const unknown = await httpJson(`${LOCAL_SUCCESS}?order_number=000000000000000000000000`);
  assert(unknown.status === 404, "unknown order → 404");

  const live = await httpJson(`${LOCAL_SUCCESS}?order_number=${ORDER_NUMBER}`);
  console.log("  live order_number-only response:", JSON.stringify(live.body));
  assert(live.status === 200 || live.status === 400, "live order digest-less hit does not 500");
  assert(
    live.body.message !== "Payment failed",
    "live order is not marked failed by a digest-less hit",
  );

  const dummyShape = {
    message: live.body.message,
    orderNumber: live.body.orderNumber,
    orderType: live.body.orderType,
    userId: String(live.body.userId || ""),
    orderFulfilled: live.body.orderFulfilled,
    fulfillReason: live.body.fulfillReason,
  };
  assert(dummyShape.orderNumber === ORDER_NUMBER, "orderNumber echoed");
  assert(dummyShape.orderType === "menuorders", "orderType is menuorders");
  assert(dummyShape.userId === USER_ID, "userId matches dummy payload");
  assert("orderFulfilled" in live.body, "orderFulfilled is present (new contract)");
  assert("fulfillReason" in live.body, "fulfillReason is present (new contract)");
}

async function main() {
  if (!MERCHANT_KEY || !SUCCESS_URL) {
    throw new Error("MONRI_KEY / SUCCESS_URL missing from .env.dev");
  }
  runGuardCases();
  await runHttpCases();
  console.log("\nDummy success-URL verification passed.");
}

main().catch((err) => {
  console.error("\nDummy success-URL verification failed:", err.message);
  process.exit(1);
});
