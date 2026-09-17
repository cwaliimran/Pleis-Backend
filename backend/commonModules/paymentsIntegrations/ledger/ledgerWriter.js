const crypto = require("crypto");
const PaymentLedgerEntry = require("./PaymentLedgerEntry.model");
const PaymentAttemptLog = require("./PaymentAttemptLog.model");

/** Gateway keeps 1% of everything Pleis receives — Pleis cost (Payout §4.1). */
const GATEWAY_RATE = 0.01;

const EXCLUSION_REASONS = {
  RESERVATION_ACT_NOT_COMMISSIONED: "RESERVATION_ACT_NOT_COMMISSIONED",
  SUBSCRIPTION_NOT_ORGANIZER_PAYOUT: "SUBSCRIPTION_NOT_ORGANIZER_PAYOUT",
  ZERO_AMOUNT: "ZERO_AMOUNT",
  FREE_RESERVATION: "FREE_RESERVATION",
  OFF_APP_PAYMENT: "OFF_APP_PAYMENT",
};

const OFF_APP_PAYMENT_METHODS = new Set(["cash", "external", "pos", "offapp"]);

function hashPayload(payload) {
  if (!payload) return "";
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  return crypto.createHash("sha256").update(json).digest("hex");
}

function moduleFromOrderType(orderType) {
  switch (orderType) {
    case "ticketingbookings":
    case "tickettransfer":
      return "TICKETING";
    case "menuorders":
      return "ORDERING";
    case "userreservations":
      return "RESERVATION";
    case "subscription":
      return "SUBSCRIPTION";
    default:
      return null;
  }
}

/**
 * Initial payout_status on paid capture (Payout §2.1 / §2.2).
 * Ticketing → HELD until event ends.
 * Ordering → PENDING (selectable once service completed).
 * Reservation act → EXCLUDED (voucher spend pays via ordering).
 * Subscription → EXCLUDED (Pleis B2B revenue, not organizer payout).
 */
function initialPayoutFields(module) {
  if (module === "TICKETING") {
    return {
      payoutStatus: "HELD",
      exclusionReason: null,
      excludedAt: null,
      excludedBy: null,
    };
  }
  if (module === "ORDERING") {
    return {
      payoutStatus: "PENDING",
      exclusionReason: null,
      excludedAt: null,
      excludedBy: null,
    };
  }
  if (module === "RESERVATION") {
    return {
      payoutStatus: "EXCLUDED",
      exclusionReason: EXCLUSION_REASONS.RESERVATION_ACT_NOT_COMMISSIONED,
      excludedAt: new Date(),
      excludedBy: null,
    };
  }
  if (module === "SUBSCRIPTION") {
    return {
      payoutStatus: "EXCLUDED",
      exclusionReason: EXCLUSION_REASONS.SUBSCRIPTION_NOT_ORGANIZER_PAYOUT,
      excludedAt: new Date(),
      excludedBy: null,
    };
  }
  return {
    payoutStatus: "EXCLUDED",
    exclusionReason: "UNKNOWN_MODULE",
    excludedAt: new Date(),
    excludedBy: null,
  };
}

function toCents(value) {
  if (value == null || value === "") return 0;
  return Math.round(Number(value) * 100);
}

function gatewayCostFromReceived(amountCents) {
  return Math.round(Number(amountCents || 0) * GATEWAY_RATE);
}

function buildLedgerEntryInput(event) {
  const orderType = event.orderType;
  const module = event.module || moduleFromOrderType(orderType);
  const amountCents =
    event.amountCents != null
      ? Math.round(Number(event.amountCents))
      : toCents(event.amount);
  const tipAmountCents =
    event.tipAmountCents != null
      ? Math.round(Number(event.tipAmountCents))
      : toCents(event.tipAmount || 0);
  const payout = initialPayoutFields(module);
  const method = String(event.paymentMethod || "").toLowerCase();
  const isOffApp =
    event.paymentChannel === "offapp" ||
    (module === "ORDERING" && OFF_APP_PAYMENT_METHODS.has(method));
  if (isOffApp) {
    payout.payoutStatus = "EXCLUDED";
    payout.exclusionReason = EXCLUSION_REASONS.OFF_APP_PAYMENT;
    payout.excludedAt = new Date();
    payout.excludedBy = null;
  }

  const notesParts = [event.notes || ""].filter(Boolean);
  if (module === "RESERVATION") {
    notesParts.push(
      "Min-spend voucher path: reservation act is not a commissioned payout line; spend enters via ordering.",
    );
  }

  return {
    schemaVersion: 5,
    orderId: event.orderId,
    orderType,
    module,
    organization: event.organization,
    companyOrganizer: event.companyOrganizer,
    user: event.user,
    provider: event.provider || "monri",
    providerTransactionId: event.providerTransactionId,
    confirmationNumber: event.confirmationNumber,
    amountCents,
    tipAmountCents,
    gatewayCostCents:
      event.gatewayCostCents != null
        ? Math.round(Number(event.gatewayCostCents))
        : gatewayCostFromReceived(amountCents),
    currency: event.currency || "EUR",
    paymentStatus: event.paymentStatus,
    paymentMethod: event.paymentMethod,
    cardLast4: event.cardLast4 || null,
    cardBrand: event.cardBrand || null,
    capturedAt: event.capturedAt || new Date(),
    payoutStatus: event.payoutStatus || payout.payoutStatus,
    statementId: event.statementId || null,
    payoutPaidAt: event.payoutPaidAt || null,
    payoutBatchId: event.payoutBatchId || null,
    fiscalizationStatus: event.fiscalizationStatus || "NOT_FISCALIZED",
    fiscalizedAt: event.fiscalizedAt || null,
    paymentChannel: isOffApp ? "offapp" : event.paymentChannel || "pleis",
    offAppFiscalizationStatus: isOffApp
      ? event.offAppFiscalizationStatus || "NOT_FISCALIZED"
      : event.offAppFiscalizationStatus || undefined,
    offAppBatchId: event.offAppBatchId || null,
    excludedAt: event.excludedAt !== undefined ? event.excludedAt : payout.excludedAt,
    excludedBy: event.excludedBy !== undefined ? event.excludedBy : payout.excludedBy,
    exclusionReason:
      event.exclusionReason !== undefined
        ? event.exclusionReason
        : payout.exclusionReason,
    invoiceIds: event.invoiceIds || [],
    notes: notesParts.filter(Boolean).join(" ").trim(),
  };
}

/**
 * Idempotent write on { orderId, module }.
 * Skips unpaid / zero-amount / incomplete / free-reservation noise.
 * Existing rows are left unchanged (double webhook / finalizer safe).
 */
async function writePaymentLedgerEntry(event) {
  const doc = buildLedgerEntryInput(event);
  if (!doc.orderId || !doc.orderType || !doc.module || !doc.paymentStatus) {
    return { skipped: true, reason: "incomplete_ledger_event" };
  }
  if (doc.orderType === "tickettransfer") {
    return { skipped: true, reason: "tickettransfer_skip" };
  }
  if (String(doc.paymentStatus).toLowerCase() !== "paid") {
    return { skipped: true, reason: "unpaid_skip" };
  }
  if (!doc.amountCents || doc.amountCents <= 0) {
    return { skipped: true, reason: "zero_amount_skip" };
  }

  try {
    const result = await PaymentLedgerEntry.findOneAndUpdate(
      { orderId: doc.orderId, module: doc.module },
      { $setOnInsert: doc },
      { upsert: true, new: true, includeResultMetadata: true },
    );

    // Mongoose 7+: result may be { value, lastErrorObject }
    const value = result?.value !== undefined ? result.value : result;
    const upserted =
      result?.lastErrorObject?.upserted != null ||
      result?.lastErrorObject?.updatedExisting === false;

    if (upserted) {
      return { created: true, entry: value };
    }
    return { created: false, duplicate: true, entry: value };
  } catch (err) {
    if (err && err.code === 11000) {
      const entry = await PaymentLedgerEntry.findOne({
        orderId: doc.orderId,
        module: doc.module,
      }).lean();
      return { created: false, duplicate: true, entry };
    }
    throw err;
  }
}

async function writePaymentAttemptLog(event) {
  if (!event?.orderNumber || !event?.status) {
    return { skipped: true, reason: "incomplete_attempt_event" };
  }
  return PaymentAttemptLog.create({
    schemaVersion: 5,
    orderNumber: String(event.orderNumber),
    orderType: event.orderType,
    provider: event.provider || "monri",
    status: event.status,
    amountCents:
      event.amountCents != null
        ? event.amountCents
        : Math.round(Number(event.amount || 0) * 100),
    currency: event.currency || "EUR",
    payloadHash: event.payloadHash || hashPayload(event.payload),
    errorCode: event.errorCode || "",
    attemptedAt: event.attemptedAt || new Date(),
  });
}

/**
 * Resolve euros + tip from the paid order document (preferred over Monri minor units).
 */
async function resolveCaptureAmounts(orderType, orderId) {
  const mongoose = require("mongoose");
  if (orderType === "menuorders") {
    const MenuOrders = require("@OrdersModel");
    const order = await MenuOrders.findById(orderId)
      .select("totalPrice priceBreakdown user organization")
      .lean();
    return {
      amount: Number(order?.totalPrice || 0),
      tipAmount: Number(order?.priceBreakdown?.tip || 0),
      organization: order?.organization,
      companyOrganizer: undefined,
      user: order?.user,
    };
  }
  if (orderType === "ticketingbookings") {
    const { TicketingOrders } = require("@TicketingOrdersModel");
    const order = await TicketingOrders.findById(orderId)
      .select("orderPricing.total organization companyOrganizer user")
      .lean();
    return {
      amount: Number(order?.orderPricing?.total || 0),
      tipAmount: 0,
      organization: order?.organization,
      companyOrganizer: order?.companyOrganizer,
      user: order?.user,
    };
  }
  if (orderType === "userreservations") {
    const { UserReservations } = require("@UserReservationsModel");
    const reservation = await UserReservations.findById(orderId)
      .select("amount organizationId companyOrganizer userId")
      .lean();
    return {
      amount: Number(reservation?.amount || 0),
      tipAmount: 0,
      organization: reservation?.organizationId,
      companyOrganizer: reservation?.companyOrganizer,
      user: reservation?.userId,
    };
  }
  if (orderType === "subscription") {
    // Amount comes from Monri tx / caller (minor or major — caller should pass amountCents).
    return { amount: 0, tipAmount: 0 };
  }
  void mongoose;
  return { amount: 0, tipAmount: 0 };
}

/**
 * Paid-capture entry point for webhook + finalizers (idempotent).
 */
async function recordPaidCaptureLedger(event) {
  try {
    if (!event?.orderId || !event?.orderType) {
      return { skipped: true, reason: "incomplete_ledger_event" };
    }
    if (String(event.paymentStatus || event.status || "").toLowerCase() !== "paid") {
      return { skipped: true, reason: "unpaid_skip" };
    }

    let amount = event.amount;
    let tipAmount = event.tipAmount;
    let amountCents = event.amountCents;
    let tipAmountCents = event.tipAmountCents;
    let organization = event.organization;
    let companyOrganizer = event.companyOrganizer;
    let user = event.user;

    if (amountCents == null && (amount == null || amount === "")) {
      const resolved = await resolveCaptureAmounts(event.orderType, event.orderId);
      amount = resolved.amount;
      tipAmount = tipAmount != null ? tipAmount : resolved.tipAmount;
      organization = organization || resolved.organization;
      companyOrganizer = companyOrganizer || resolved.companyOrganizer;
      user = user || resolved.user;
    }

    return writePaymentLedgerEntry({
      ...event,
      paymentStatus: "paid",
      amount,
      tipAmount,
      amountCents,
      tipAmountCents,
      organization,
      companyOrganizer,
      user,
      providerTransactionId:
        event.providerTransactionId || event.transactionId || null,
    });
  } catch (err) {
    console.error("[ledger] recordPaidCaptureLedger failed:", err.message);
    return { skipped: true, reason: "ledger_write_error", error: err.message };
  }
}

module.exports = {
  GATEWAY_RATE,
  EXCLUSION_REASONS,
  OFF_APP_PAYMENT_METHODS,
  hashPayload,
  moduleFromOrderType,
  initialPayoutFields,
  toCents,
  gatewayCostFromReceived,
  buildLedgerEntryInput,
  writePaymentLedgerEntry,
  writePaymentAttemptLog,
  resolveCaptureAmounts,
  recordPaidCaptureLedger,
};
