/**
 * IP threat intelligence: geo lookup, event logging, auto/manual blocklist.
 *
 * Geo provider: http://ip-api.com (free, 45 req/min) — always cache results.
 * @see https://ip-api.com/docs/api:json
 */
const axios = require("axios");
const { getRedisClient, isRedisUp } = require("../../config/redis/redisConfig");
const { IpThreatProfile, IpThreatEvent } = require("../../models/IpThreat");

const GEO_CACHE_TTL_SEC = 7 * 24 * 60 * 60; // 7 days
const BLOCK_CACHE_PREFIX = "ip:blocked:";
const FAIL_COUNT_PREFIX = "ip:fail:";
const GEO_CACHE_PREFIX = "ip:geo:";

const AUTO_BLOCK_FAILED =
  Number(process.env.IP_AUTO_BLOCK_FAILED_LOGINS || 25);
const AUTO_BLOCK_WINDOW_SEC =
  Number(process.env.IP_AUTO_BLOCK_WINDOW_MIN || 15) * 60;

function normalizeIp(ip) {
  if (!ip || typeof ip !== "string") return null;
  let cleaned = ip.trim();
  if (cleaned.startsWith("::ffff:")) cleaned = cleaned.slice(7);
  // X-Forwarded-For may contain a list — take first hop
  if (cleaned.includes(",")) cleaned = cleaned.split(",")[0].trim();
  return cleaned.toLowerCase() || null;
}

function getClientIp(req) {
  // Prefer Express req.ip (respects trust proxy)
  const fromReq =
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    null;
  return normalizeIp(
    typeof fromReq === "string" ? fromReq : String(fromReq || ""),
  );
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === "unknown" || ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80"))
    return true;
  return false;
}

async function lookupGeo(ip) {
  if (!ip || isPrivateIp(ip)) return null;

  const cacheKey = `${GEO_CACHE_PREFIX}${ip}`;
  if (isRedisUp()) {
    try {
      const cached = await getRedisClient().get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (_) {
      /* ignore */
    }
  }

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,query`;
    const { data } = await axios.get(url, { timeout: 2500 });
    if (!data || data.status !== "success") return null;

    const geo = {
      country: data.country,
      countryCode: data.countryCode,
      region: data.region,
      regionName: data.regionName,
      city: data.city,
      zip: data.zip,
      lat: data.lat,
      lon: data.lon,
      query: data.query || ip,
    };

    if (isRedisUp()) {
      try {
        await getRedisClient().set(
          cacheKey,
          JSON.stringify(geo),
          "EX",
          GEO_CACHE_TTL_SEC,
        );
      } catch (_) {
        /* ignore */
      }
    }
    return geo;
  } catch (err) {
    console.warn("ip-api geo lookup failed:", err?.message || err);
    return null;
  }
}

async function cacheBlock(ip, blockedUntil) {
  if (!isRedisUp() || !ip) return;
  try {
    const key = `${BLOCK_CACHE_PREFIX}${ip}`;
    const client = getRedisClient();
    if (blockedUntil) {
      const ttl = Math.max(
        1,
        Math.ceil((new Date(blockedUntil).getTime() - Date.now()) / 1000),
      );
      await client.set(key, "1", "EX", ttl);
    } else {
      // Permanent — 30 days redis key, refreshed by Mongo on miss
      await client.set(key, "1", "EX", 30 * 24 * 60 * 60);
    }
  } catch (_) {
    /* ignore */
  }
}

async function clearBlockCache(ip) {
  if (!isRedisUp() || !ip) return;
  try {
    await getRedisClient().del(`${BLOCK_CACHE_PREFIX}${ip}`);
  } catch (_) {
    /* ignore */
  }
}

/**
 * Fast path for middleware — Redis first, Mongo on miss.
 */
async function isIpBlocked(ip) {
  const normalized = normalizeIp(ip);
  if (!normalized || isPrivateIp(normalized)) return false;

  if (isRedisUp()) {
    try {
      const hit = await getRedisClient().get(
        `${BLOCK_CACHE_PREFIX}${normalized}`,
      );
      if (hit) return true;
    } catch (_) {
      /* fall through */
    }
  }

  try {
    const profile = await IpThreatProfile.findOne({
      ip: normalized,
      status: "blocked",
    })
      .select("block")
      .lean();

    if (!profile) return false;

    const until = profile.block?.blockedUntil;
    if (until && new Date(until) < new Date()) {
      // Expired temporary block
      await IpThreatProfile.updateOne(
        { ip: normalized },
        {
          $set: {
            status: "active",
            "block.reason": null,
            "block.blockedAt": null,
            "block.blockedBy": null,
            "block.blockedUntil": null,
            "block.auto": false,
          },
        },
      );
      await clearBlockCache(normalized);
      return false;
    }

    await cacheBlock(normalized, until || null);
    return true;
  } catch (err) {
    console.warn("isIpBlocked check failed:", err?.message);
    return false;
  }
}

async function bumpFailCounter(ip) {
  if (!isRedisUp() || !ip) return 0;
  try {
    const client = getRedisClient();
    const key = `${FAIL_COUNT_PREFIX}${ip}`;
    const n = await client.incr(key);
    if (n === 1) await client.expire(key, AUTO_BLOCK_WINDOW_SEC);
    return n;
  } catch (_) {
    return 0;
  }
}

/**
 * Record a threat event. Fire-and-forget safe — never throws to callers.
 */
async function recordThreatEvent(req, type, meta = {}) {
  try {
    const ip = getClientIp(req);
    if (!ip || isPrivateIp(ip)) return null;

    const geo = await lookupGeo(ip);
    const path = req.originalUrl || req.path;
    const method = req.method;
    const userAgent = req.headers["user-agent"] || null;
    const email =
      typeof meta.email === "string"
        ? meta.email.toLowerCase().slice(0, 120)
        : undefined;

    const statField =
      type === "failed_login"
        ? "failedLogin"
        : type === "failed_otp"
          ? "failedOtp"
          : type === "rate_limited"
            ? "rateLimited"
            : null;

    const inc = { "stats.totalEvents": 1 };
    if (statField) inc[`stats.${statField}`] = 1;

    const setOnInsert = {
      ip,
      "stats.firstSeenAt": new Date(),
    };
    const set = {
      "stats.lastEventAt": new Date(),
    };
    if (geo) {
      set.geo = geo;
      set.geoFetchedAt = new Date();
    }

    await IpThreatProfile.findOneAndUpdate(
      { ip },
      { $inc: inc, $set: set, $setOnInsert: setOnInsert },
      { upsert: true, new: true },
    );

    await IpThreatEvent.create({
      ip,
      type,
      path,
      method,
      userAgent,
      email,
      endpoint: meta.endpoint || null,
      meta: { ...meta, email: undefined },
      geo: geo || undefined,
    });

    // Auto-block on repeated auth failures
    if (type === "failed_login" || type === "failed_otp") {
      const fails = await bumpFailCounter(ip);
      if (fails >= AUTO_BLOCK_FAILED) {
        await blockIp(ip, {
          reason: `Auto-blocked after ${fails} auth failures in ${AUTO_BLOCK_WINDOW_SEC / 60}m`,
          auto: true,
          permanent: true,
        });
        await IpThreatEvent.create({
          ip,
          type: "auto_block",
          path,
          method,
          userAgent,
          meta: { fails, windowSec: AUTO_BLOCK_WINDOW_SEC },
          geo: geo || undefined,
        });
      }
    }

    return { ip, geo };
  } catch (err) {
    console.warn("recordThreatEvent failed:", err?.message || err);
    return null;
  }
}

async function blockIp(
  ip,
  { reason = "manual", blockedBy = null, permanent = true, hours = null, auto = false } = {},
) {
  const normalized = normalizeIp(ip);
  if (!normalized || isPrivateIp(normalized)) {
    throw new Error("Cannot block private or invalid IP");
  }

  const blockedUntil =
    permanent || !hours
      ? null
      : new Date(Date.now() + Number(hours) * 60 * 60 * 1000);

  const geo = await lookupGeo(normalized);

  await IpThreatProfile.findOneAndUpdate(
    { ip: normalized },
    {
      $set: {
        status: "blocked",
        "block.reason": reason,
        "block.blockedAt": new Date(),
        "block.blockedBy": blockedBy,
        "block.blockedUntil": blockedUntil,
        "block.auto": !!auto,
        ...(geo
          ? { geo, geoFetchedAt: new Date() }
          : {}),
      },
      $setOnInsert: {
        ip: normalized,
        "stats.firstSeenAt": new Date(),
        "stats.lastEventAt": new Date(),
      },
    },
    { upsert: true },
  );

  await cacheBlock(normalized, blockedUntil);

  if (!auto) {
    await IpThreatEvent.create({
      ip: normalized,
      type: "manual_block",
      meta: { reason, permanent, hours, blockedBy },
      geo: geo || undefined,
    });
  }

  return { ip: normalized, blockedUntil, reason };
}

async function unblockIp(ip, { unblockedBy = null } = {}) {
  const normalized = normalizeIp(ip);
  if (!normalized) throw new Error("Invalid IP");

  await IpThreatProfile.updateOne(
    { ip: normalized },
    {
      $set: {
        status: "active",
        "block.reason": null,
        "block.blockedAt": null,
        "block.blockedBy": null,
        "block.blockedUntil": null,
        "block.auto": false,
      },
    },
  );
  await clearBlockCache(normalized);

  await IpThreatEvent.create({
    ip: normalized,
    type: "manual_unblock",
    meta: { unblockedBy },
  });

  return { ip: normalized };
}

function recordAuthFailure(req, { reason, email } = {}) {
  const type =
    reason === "otp" || reason === "failed_otp" ? "failed_otp" : "failed_login";
  // Non-blocking
  setImmediate(() => {
    recordThreatEvent(req, type, { reason, email }).catch(() => {});
  });
}

function recordRateLimited(req, { endpoint } = {}) {
  setImmediate(() => {
    recordThreatEvent(req, "rate_limited", { endpoint }).catch(() => {});
  });
}

function recordBlockedHit(req) {
  setImmediate(() => {
    recordThreatEvent(req, "blocked_hit", {}).catch(() => {});
  });
}

module.exports = {
  normalizeIp,
  getClientIp,
  isPrivateIp,
  lookupGeo,
  isIpBlocked,
  recordThreatEvent,
  recordAuthFailure,
  recordRateLimited,
  recordBlockedHit,
  blockIp,
  unblockIp,
  AUTO_BLOCK_FAILED,
  AUTO_BLOCK_WINDOW_SEC,
};
