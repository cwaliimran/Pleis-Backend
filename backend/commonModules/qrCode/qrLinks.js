/**
 * QR codes and deep links (Requirement Set #59, #82, #83, #84; Defects Report
 * D-01, D-13).
 *
 *   link     <link base>q/<token>        printed in the QR, sent by share
 *   app      com.pleis://q/<token>       what the open page hands to the app
 *   resolve  GET /api/v1/app/qr-code/resolve/<token>
 *
 * The token is short, unique and opaque (never a record id). A code that is
 * not active resolves to nothing, and a token is never issued twice.
 */
const mongoose = require("mongoose");
const { customAlphabet } = require("nanoid");

const {
  GlobalBase,
  GlobalcheckInTableID,
  Globalloyalty,
  GlobalcheckInOrder,
  Globaleventn,
  GlobalOrganization,
  GlobalReservation,
} = require("./models/QR");
const Organizations = require("../organizations/Organization");
const DeliveryOptions = require("../organizations/DeliveryOptions");
const Venues = require("../venues/Venues");
const { Events } = require("../events/Event");
const { UserReservations } = require("../reservations/UsersReservation");
const { User } = require("../../models/UserModel");
const { resolvePleisLinkBase, resolvePleisAppScheme } = require("../../config/CONSTANTS");

// No 0/O, 1/l/I: the token may be typed from a label. 57^10 ≈ 3.6e17.
const TOKEN_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const TOKEN_LENGTH = 10;
const generateToken = customAlphabet(TOKEN_ALPHABET, TOKEN_LENGTH);
const TOKEN_PATTERN = new RegExp(`^[${TOKEN_ALPHABET}]{${TOKEN_LENGTH}}$`);

const isValidToken = (token) => typeof token === "string" && TOKEN_PATTERN.test(token);

const buildCodeLink = (token) => (token ? `${resolvePleisLinkBase()}q/${token}` : "");
const buildAppLink = (token) => `${resolvePleisAppScheme()}://q/${token}`;

/** Public type names the app understands, by stored type. */
const PUBLIC_TYPES = {
  organization: "organization",
  event: "event",
  loyalty: "loyaltyClub",
  checkInOrder: "checkIn",
  checkInTableID: "table",
  reservation: "reservation",
};

const MODELS = {
  organization: GlobalOrganization,
  event: Globaleventn,
  loyalty: Globalloyalty,
  checkInOrder: GlobalcheckInOrder,
  checkInTableID: GlobalcheckInTableID,
  reservation: GlobalReservation,
};

const TARGET_FIELD = {
  organization: "organizationId",
  event: "eventId",
  loyalty: "loyaltyId",
  checkInOrder: "venueId",
  checkInTableID: "deliveryOptionId",
  reservation: "reservationId",
};

const isLive = (doc) => !!doc && doc.status !== "deleted";

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const toId = (value) => (value && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null);

/**
 * Looks the target up and returns what is stored next to it: organization,
 * venue and, for a table, the table's label. Throws a 400/404 error with a
 * translation key when the target does not exist.
 */
const describeTarget = async (type, body) => {
  switch (type) {
    case "organization": {
      const org = await Organizations.findById(toId(body.organizationId)).select("status basicInfo.name creator").lean();
      if (!isLive(org)) throw httpError(404, "organization_not_found");
      return { organization: org._id, name: org.basicInfo?.name || "", owner: org.creator };
    }
    case "event": {
      const event = await Events.findById(toId(body.eventId))
        .select("status basicInfo.title basicInfo.organization basicInfo.venue creator")
        .lean();
      if (!isLive(event)) throw httpError(404, "event_not_found");
      return {
        organization: event.basicInfo?.organization || null,
        venue: event.basicInfo?.venue || null,
        name: event.basicInfo?.title || "",
        owner: event.creator,
      };
    }
    case "loyalty": {
      const company = await User.findById(toId(body.loyaltyId))
        .select("companyDetails.loyaltySettings.title companyDetails.name")
        .lean();
      if (!company) throw httpError(404, "loyalty_club_not_found");
      return {
        name: company.companyDetails?.loyaltySettings?.title || company.companyDetails?.name || "",
        owner: company._id,
      };
    }
    case "checkInOrder":
    case "checkInTableID": {
      const venue = await Venues.findById(toId(body.venueId)).select("status title organization creator").lean();
      if (!isLive(venue) || !venue.organization) throw httpError(404, "venue_not_found");
      const described = { organization: venue.organization, venue: venue._id, name: venue.title || "", owner: venue.creator };
      if (type === "checkInOrder") return described;

      const table = await DeliveryOptions.findOne({
        _id: toId(body.deliveryOptionId),
        organization: venue.organization,
        deliveryMethod: "tableDelivery",
        status: "active",
      })
        .select("title")
        .lean();
      if (!table) throw httpError(400, "qr_table_not_found");
      return { ...described, tableLabel: table.title };
    }
    case "reservation": {
      const reservation = await UserReservations.findById(toId(body.reservationId))
        .select("status organizationId userId")
        .lean();
      if (!reservation) throw httpError(404, "reservation_not_found");
      return { organization: reservation.organizationId || null, name: "", owner: reservation.userId };
    }
    default:
      throw httpError(400, "invalid_type");
  }
};

/**
 * Builds and saves a new code. `body` carries `globalQrType`, `label`,
 * `creator` and the target field(s) of the type.
 */
const createCode = async (body, { source = "generator" } = {}) => {
  const type = body.globalQrType;
  const Model = MODELS[type];
  if (!Model) throw httpError(400, "invalid_type");

  const target = await describeTarget(type, body);
  const doc = {
    label: String(body.label || "").trim() || target.tableLabel || target.name || type,
    globalQrType: type,
    // A code issued by the share button belongs to the content's owner.
    creator: body.creator || target.owner,
    source,
    organization: target.organization || null,
    venue: target.venue || null,
  };

  switch (type) {
    case "organization":
      doc.organizationId = toId(body.organizationId);
      break;
    case "event":
      doc.eventId = toId(body.eventId);
      break;
    case "loyalty":
      doc.loyaltyId = toId(body.loyaltyId);
      break;
    case "checkInOrder":
      doc.venueId = toId(body.venueId);
      break;
    case "checkInTableID":
      doc.venueId = toId(body.venueId);
      doc.deliveryOptionId = toId(body.deliveryOptionId);
      doc.tableLabel = target.tableLabel;
      break;
    case "reservation":
      doc.reservationId = toId(body.reservationId);
      break;
    default:
      break;
  }

  // A collision in 3.6e17 is not expected; retry anyway rather than fail.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await new Model({ ...doc, token: generateToken() }).save();
    } catch (error) {
      if (error?.code !== 11000 || !/token/.test(String(error?.message))) throw error;
    }
  }
  throw httpError(500, "internal_server_error");
};

/**
 * Codes made before tokens existed get one the first time they are listed.
 * Returns the same objects with `token` and `link` set.
 */
const withLinks = async (codes = []) => {
  await Promise.all(
    codes
      .filter((code) => code && !code.token)
      .map(async (code) => {
        const token = generateToken();
        const result = await GlobalBase.updateOne(
          { _id: code._id, token: { $exists: false } },
          { $set: { token } }
        );
        if (result.modifiedCount) {
          code.token = token;
        } else {
          const fresh = await GlobalBase.findById(code._id).select("token").lean();
          code.token = fresh?.token;
        }
      })
  );
  return codes.map((code) => (code ? { ...code, link: buildCodeLink(code.token) } : code));
};

/**
 * Resolves a token to what the app opens. Null when the token is unknown, the
 * code is revoked, or its target no longer exists.
 */
const resolveToken = async (token) => {
  if (!isValidToken(token)) return null;
  const code = await GlobalBase.findOne({ token }).lean();
  if (!code || code.status !== "active") return null;

  // Not "token": the app stores any `data.token` in a response as its session
  // token (Pleis-Mobile-Apps src/utils/network/axios.js).
  const result = {
    qrToken: code.token,
    type: PUBLIC_TYPES[code.globalQrType],
    label: code.label,
    status: code.status,
    organizationId: code.organization ? String(code.organization) : null,
    venueId: code.venue ? String(code.venue) : null,
  };

  switch (code.globalQrType) {
    case "organization": {
      const org = await Organizations.findById(code.organizationId).select("status").lean();
      if (!isLive(org)) return null;
      result.organizationId = String(org._id);
      return result;
    }
    case "event": {
      const event = await Events.findById(code.eventId).select("status").lean();
      if (!isLive(event)) return null;
      result.eventId = String(event._id);
      return result;
    }
    case "loyalty": {
      result.loyaltyClubId = String(code.loyaltyId);
      return result;
    }
    case "checkInOrder":
    case "checkInTableID": {
      const venue = await Venues.findById(code.venueId).select("status organization").lean();
      if (!isLive(venue) || !venue.organization) return null;
      result.organizationId = String(venue.organization);
      result.venueId = String(venue._id);
      if (code.globalQrType === "checkInOrder") return result;

      if (!code.deliveryOptionId) return null; // legacy free-text table code
      const table = await DeliveryOptions.findOne({
        _id: code.deliveryOptionId,
        organization: venue.organization,
        deliveryMethod: "tableDelivery",
        status: "active",
      })
        .select("title publicId")
        .lean();
      // A code of a table that was removed is not valid any more (Core §3.6.1).
      if (!table) return null;
      result.table = { deliveryOptionId: String(table._id), code: table.publicId, label: table.title };
      return result;
    }
    case "reservation": {
      result.reservationId = String(code.reservationId);
      return result;
    }
    default:
      return null;
  }
};

/** Share button types (#83) → stored type. `venue` is the organization page. */
const SHARE_TYPES = {
  organization: "organization",
  organizer: "organization",
  venue: "organization",
  event: "event",
  loyaltyclub: "loyalty",
  "loyalty-club": "loyalty",
  loyalty: "loyalty",
  reservation: "reservation",
};

/**
 * The deep link the share button sends for a piece of content: the same link
 * as that content's QR code (D-13). Reuses the oldest active code of the
 * content, generator codes first; otherwise issues one that stays off the
 * QR codes page.
 */
const getShareCode = async ({ type, id, userId = null }) => {
  const storedType = SHARE_TYPES[String(type || "").toLowerCase()];
  if (!storedType) throw httpError(400, "invalid_type");
  if (!mongoose.isValidObjectId(id)) throw httpError(400, "invalid_parameters");

  let targetId = String(id);
  // A Venues id given as "venue": share its organization's page.
  if (storedType === "organization" && !(await Organizations.exists({ _id: targetId }))) {
    const venue = await Venues.findById(targetId).select("organization").lean();
    if (!venue?.organization) throw httpError(404, "organization_not_found");
    targetId = String(venue.organization);
  }

  const field = TARGET_FIELD[storedType];
  const existing = await GlobalBase.find({
    globalQrType: storedType,
    [field]: new mongoose.Types.ObjectId(targetId),
    status: "active",
  })
    .sort({ source: 1, createdAt: 1 }) // "generator" < "share"
    .limit(1)
    .lean();
  if (existing[0]) {
    const [withLink] = await withLinks(existing);
    return withLink;
  }

  const created = await createCode(
    { globalQrType: storedType, [field]: targetId, creator: userId },
    { source: "share" }
  );
  const [withLink] = await withLinks([created.toObject()]);
  return withLink;
};

/**
 * Legacy share links (`share?type=event&id=<publicId>`) already sent around:
 * finds the content by its publicId and returns its code.
 */
const getShareCodeByPublicId = async ({ type, publicId }) => {
  const storedType = SHARE_TYPES[String(type || "").toLowerCase()];
  if (!publicId || !["organization", "event"].includes(storedType)) return null;
  const Model = storedType === "event" ? Events : Organizations;
  const doc = await Model.findOne({ publicId: String(publicId) }).select("_id status").lean();
  if (!isLive(doc)) return null;
  return getShareCode({ type, id: String(doc._id) });
};

module.exports = {
  TOKEN_LENGTH,
  PUBLIC_TYPES,
  generateToken,
  isValidToken,
  buildCodeLink,
  buildAppLink,
  createCode,
  withLinks,
  resolveToken,
  getShareCode,
  getShareCodeByPublicId,
};
