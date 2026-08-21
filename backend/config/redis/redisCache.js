const zlib = require("zlib");
const { getRedisClient, isRedisUp } = require("./redisConfig");

const redis = getRedisClient();

function buildKey(namespace, params = {}) {
  const qs = Object.entries(params)
    .sort(([a, b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return qs ? `${namespace}:${qs}` : namespace;
}

/**
 * SET
 */
async function setJson(key, value, ttl = null) {
  if (!isRedisUp()) return;

  try {
    const buf = zlib.gzipSync(Buffer.from(JSON.stringify(value)));
    if (ttl) await redis.set(key, buf, "EX", ttl);
    else await redis.set(key, buf);
  } catch (_) { }
}

/**
 * GET
 */
async function getJson(key) {
  if (!isRedisUp()) return null;

  try {
    const buf = await redis.getBuffer(key);
    if (!buf) return null;

    return JSON.parse(zlib.gunzipSync(buf).toString("utf8"));
  } catch (_) {
    return null;
  }
}

/**
 * LOCKS
 */
async function acquireLock(key, ttl = 5) {
  if (!isRedisUp()) return null;

  try {
    const token = Date.now().toString();
    const ok = await redis.set(`lock:${key}`, token, "NX", "EX", ttl);
    return ok ? token : null;
  } catch {
    return null;
  }
}

async function releaseLock(key, token) {
  if (!isRedisUp()) return;

  try {
    const lk = `lock:${key}`;
    const val = await redis.get(lk);
    if (val === token) await redis.del(lk);
  } catch (_) { }
}

/**
 * MAIN CACHE
 */
async function cache({ namespace, params = {}, ttl = 60, fetchFn }) { //ttl is in seconds //pass null to never expire
  const key = buildKey(namespace, params);

  if (!isRedisUp()) {
    console.log(`⚠️ BYPASS (Redis down) -> ${key}`);
    return fetchFn();
  }

  let existing = null;

  try {
    existing = await getJson(key);
  } catch { }

  if (existing) {
    console.log(`🟢 CACHE HIT -> ${key}`);
    return existing;
  }

  console.log(`🔵 CACHE MISS -> ${key}`);

  const lock = await acquireLock(key, 5);

  if (!lock) {
    await new Promise((r) => setTimeout(r, 120));
    return (await getJson(key)) ?? fetchFn();
  }

  try {
    const fresh = await fetchFn();
    if (
      fresh === null ||
      fresh === undefined ||
      (Array.isArray(fresh) && fresh.length === 0)
    ) {
      console.log(`⚠️ SKIP STORE (empty) -> ${key}`);
      return fresh;
    }

    // If invalidate cleared this lock while we were fetching, do not rewrite stale data
    try {
      const currentLock = await redis.get(`lock:${key}`);
      if (currentLock !== lock) {
        console.log(`⚠️ SKIP STORE (lock lost / invalidated) -> ${key}`);
        return fresh;
      }
    } catch { }

    try {
      await setJson(key, fresh, ttl === null ? null : ttl);
      console.log(`🧩 STORED -> ${key}`);
    } catch { }

    return fresh;
  } finally {
    await releaseLock(key, lock);
  }
}


/**
 * INVALIDATE
 * Always deletes the exact key + lock first (reliable).
 * SCAN is best-effort for prefix matches and must not block/skip exact DEL.
 */
async function invalidate(prefix) {
  if (!isRedisUp()) {
    console.log(`⚠️ INVALIDATE SKIPPED (Redis down) -> ${prefix}`);
    return true;
  }

  try {
    const deleted = await redis.del(prefix, `lock:${prefix}`);
    console.log(`🧹 INVALIDATED exact -> ${prefix} (deleted=${deleted})`);

    // Best-effort prefix cleanup; don't fail invalidation if SCAN has issues
    try {
      const matched = new Set();
      const stream = redis.scanStream({ match: `${prefix}*`, count: 200 });

      await Promise.race([
        new Promise((resolve, reject) => {
          stream.on("data", (keys) => keys.forEach((k) => matched.add(k)));
          stream.on("end", resolve);
          stream.on("error", reject);
        }),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);

      if (matched.size > 0) {
        const pipeline = redis.pipeline();
        for (const k of matched) {
          pipeline.del(k);
          pipeline.del(`lock:${k}`);
        }
        await pipeline.exec();
        console.log(`🧹 INVALIDATED scan -> ${prefix}* (matched=${matched.size})`);
      }
    } catch (scanErr) {
      console.log(`⚠️ INVALIDATE SCAN SKIPPED -> ${prefix}`, scanErr?.message || scanErr);
    }

    return true;
  } catch (err) {
    console.log(`⚠️ INVALIDATE FAILED -> ${prefix}`, err?.message || err);
    try {
      await redis.del(prefix, `lock:${prefix}`);
    } catch (_) { }
    return true;
  }
}

/**
 * ENGAGEMENT BUFFER
 */

async function pushBuffer(key, value) {
  if (!isRedisUp()) return;

  try {
    await redis.rpush(`buffer:${key}`, JSON.stringify(value));
  } catch (_) { }
}

async function popBufferBatch(key, limit = 500) {
  if (!isRedisUp()) return [];

  const items = [];

  try {
    for (let i = 0; i < limit; i++) {
      const item = await redis.lpop(`buffer:${key}`);
      if (!item) break;
      items.push(JSON.parse(item));
    }
  } catch (_) { }

  return items;
}

module.exports = {
  cache,
  invalidate,
  buildKey,
  acquireLock,
  releaseLock,
  pushBuffer,
  popBufferBatch,
};
