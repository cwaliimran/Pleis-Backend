const crypto = require("crypto");
const PaymentConfirmation = require("../models/PaymentConfirmation.model");

function normalizeMessageId(value) {
  return String(value || "")
    .trim()
    .replace(/^<|>$/g, "");
}

function verifyMailgunSignature({ timestamp, token, signature }) {
  const signingKey =
    process.env.MAILGUN_WEBHOOK_SIGNING_KEY ||
    process.env.MAILGUN_API_KEY ||
    "";
  if (!signingKey || !timestamp || !token || !signature) return false;
  const encoded = crypto
    .createHmac("sha256", signingKey)
    .update(`${timestamp}${token}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(encoded, "utf8"),
      Buffer.from(String(signature), "utf8"),
    );
  } catch {
    return false;
  }
}

function mapDeliveryStatus(eventName) {
  const event = String(eventName || "")
    .trim()
    .toLowerCase();
  if (event === "delivered") return "delivered";
  if (
    event === "bounced" ||
    event === "failed" ||
    event === "permanent_fail" ||
    event === "temporary_fail" ||
    event === "rejected"
  ) {
    return "bounced";
  }
  return null;
}

function extractWebhookFields(body = {}) {
  // Mailgun store/notify (event-data) and classic form posts.
  const eventData = body["event-data"] || body.eventData || {};
  const eventName = eventData.event || body.event || body.Event;
  const messageId =
    eventData.message?.headers?.["message-id"] ||
    eventData.message?.headers?.["Message-Id"] ||
    eventData.id ||
    body["Message-Id"] ||
    body.messageId ||
    body["message-id"];
  const recipient =
    eventData.recipient ||
    body.recipient ||
    body.Recipient ||
    body.to ||
    null;
  const confirmationNumber =
    eventData["user-variables"]?.confirmationNumber ||
    body["v:confirmationNumber"] ||
    body.confirmationNumber ||
    null;
  const nestedSig =
    body.signature && typeof body.signature === "object"
      ? body.signature
      : null;

  return {
    eventName,
    messageId: normalizeMessageId(messageId),
    recipient: recipient ? String(recipient).trim().toLowerCase() : null,
    confirmationNumber: confirmationNumber
      ? String(confirmationNumber).trim()
      : null,
    signature: nestedSig || {
      timestamp: body.timestamp,
      token: body.token,
      signature:
        typeof body.signature === "string" ? body.signature : undefined,
    },
  };
}

/**
 * Idempotent delivery update. Never deletes a confirmation on bounce.
 */
async function applyMailgunDeliveryEvent({
  eventName,
  messageId,
  recipient,
  confirmationNumber,
}) {
  const deliveryStatus = mapDeliveryStatus(eventName);
  if (!deliveryStatus) {
    return { updated: false, reason: "ignored_event", eventName };
  }

  let query = null;
  if (messageId) {
    query = {
      $or: [
        { emailMessageId: messageId },
        { emailMessageId: `<${messageId}>` },
      ],
    };
  } else if (confirmationNumber && recipient) {
    query = {
      confirmationNumber,
      customerEmail: new RegExp(
        `^${recipient.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i",
      ),
    };
  } else if (confirmationNumber) {
    query = { confirmationNumber };
  }

  if (!query) {
    return { updated: false, reason: "unmatched" };
  }

  const doc = await PaymentConfirmation.findOne(query);
  if (!doc) {
    return { updated: false, reason: "not_found" };
  }

  // Do not regress delivered → bounced if Mailgun reorders; bounce may
  // still overwrite sent/pending. delivered sticks unless already bounced.
  if (doc.deliveryStatus === deliveryStatus) {
    return {
      updated: false,
      reason: "already_applied",
      confirmationNumber: doc.confirmationNumber,
      deliveryStatus,
    };
  }
  if (doc.deliveryStatus === "delivered" && deliveryStatus === "bounced") {
    // Prefer bounce when Mailgun reports failure after a delivered event.
    // Still never delete the confirmation.
  }
  if (doc.deliveryStatus === "bounced" && deliveryStatus === "delivered") {
    return {
      updated: false,
      reason: "bounce_sticks",
      confirmationNumber: doc.confirmationNumber,
      deliveryStatus: doc.deliveryStatus,
    };
  }

  doc.deliveryStatus = deliveryStatus;
  await doc.save();
  return {
    updated: true,
    confirmationNumber: doc.confirmationNumber,
    deliveryStatus,
  };
}

async function mailgunDeliveryWebhook(req, res) {
  try {
    const fields = extractWebhookFields(req.body || {});
    const sig = fields.signature || {};
    const timestamp = sig.timestamp || req.body?.timestamp;
    const token = sig.token || req.body?.token;
    const signature = sig.signature || req.body?.signature;

    const sharedSecret = process.env.MAILGUN_WEBHOOK_SECRET;
    const headerSecret = req.get("x-mailgun-webhook-secret");
    const signedOk = verifyMailgunSignature({ timestamp, token, signature });
    const secretOk =
      sharedSecret && headerSecret && headerSecret === sharedSecret;

    if (!signedOk && !secretOk) {
      return res.status(401).json({ message: "unauthorized" });
    }

    const result = await applyMailgunDeliveryEvent(fields);
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[mailgun-webhook]", error.message);
    return res.status(500).json({ message: "webhook_failed" });
  }
}

module.exports = {
  mailgunDeliveryWebhook,
  applyMailgunDeliveryEvent,
  mapDeliveryStatus,
  verifyMailgunSignature,
  normalizeMessageId,
  extractWebhookFields,
};
