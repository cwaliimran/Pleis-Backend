const {
  sendResponse,
  parsePaginationParams,
} = require("../../helperUtils/responseUtil");
const { IpThreatProfile, IpThreatEvent } = require("../../models/IpThreat");
const {
  blockIp,
  unblockIp,
  lookupGeo,
  normalizeIp,
} = require("../../services/security/ipThreatService");

const listThreatProfiles = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { status, keyword } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (keyword) {
      filter.$or = [
        { ip: new RegExp(String(keyword).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
        { "geo.country": new RegExp(String(keyword), "i") },
        { "geo.city": new RegExp(String(keyword), "i") },
      ];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      IpThreatProfile.find(filter)
        .sort({ "stats.lastEventAt": -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      IpThreatProfile.countDocuments(filter),
    ]);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ip_threats_fetched",
      data: items,
      meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
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

const getThreatProfile = async (req, res) => {
  try {
    const ip = normalizeIp(req.params.ip);
    if (!ip) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_ip",
      });
    }

    const profile = await IpThreatProfile.findOne({ ip }).lean();
    const events = await IpThreatEvent.find({ ip })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ip_threat_fetched",
      data: { profile, events },
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

const listBlockedIps = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const skip = (page - 1) * limit;
    const filter = { status: "blocked" };
    const [items, total] = await Promise.all([
      IpThreatProfile.find(filter)
        .sort({ "block.blockedAt": -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      IpThreatProfile.countDocuments(filter),
    ]);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ip_blocklist_fetched",
      data: items,
      meta: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
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

const blockIpHandler = async (req, res) => {
  try {
    const { ip, reason, permanent = true, hours } = req.body || {};
    if (!ip) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "ip_required",
      });
    }

    const result = await blockIp(ip, {
      reason: reason || "Blocked by admin",
      blockedBy: req.user?._id || null,
      permanent: permanent !== false && !hours,
      hours: hours ? Number(hours) : null,
      auto: false,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ip_blocked",
      data: result,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: error.message || "block_failed",
      error,
    });
  }
};

const unblockIpHandler = async (req, res) => {
  try {
    const ip = req.params.ip || req.body?.ip;
    if (!ip) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "ip_required",
      });
    }

    const result = await unblockIp(ip, { unblockedBy: req.user?._id || null });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ip_unblocked",
      data: result,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: error.message || "unblock_failed",
      error,
    });
  }
};

const refreshGeo = async (req, res) => {
  try {
    const ip = normalizeIp(req.params.ip);
    const geo = await lookupGeo(ip);
    if (geo) {
      await IpThreatProfile.updateOne(
        { ip },
        { $set: { geo, geoFetchedAt: new Date() } },
      );
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "geo_refreshed",
      data: { ip, geo },
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

module.exports = {
  listThreatProfiles,
  getThreatProfile,
  listBlockedIps,
  blockIpHandler,
  unblockIpHandler,
  refreshGeo,
};
