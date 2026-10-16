const zlib = require("zlib");
const { getRedisClient, isRedisUp } = require("./redisConfig");

const redis = getRedisClient();

/**
 * Process-local L1 in front of Azure Redis (home bundles).
 * Skips ~200–700ms gzip GET RTT on warm / single-instance load.
 * Cleared on process restart and invalidate(); wiped Redis alone does not clear L1.
 */
const l1Store = new Map(); // key -> { value, expiresAt }

function l1Get(key) {
  const row = l1Store.get(key);
  if (!row) return null;
  if (row.expiresAt <= Date.now()) {
    l1Store.delete(key);
    return null;
  }
  return row.value;
}

function l1Set(key, value, ttlSec) {
  if (!ttlSec || ttlSec <= 0 || value === undefined) return;
  l1Store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

function l1ClearPrefix(prefix) {
  if (!prefix) {
    l1Store.clear();
    return;
  }
  for (const k of l1Store.keys()) {
    if (k === prefix || k.startsWith(prefix)) l1Store.delete(k);
  }
}

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
    // Never write immortal keys — coerce missing/invalid TTL to 60s.
    const effectiveTtl = ttl == null || ttl <= 0 ? 60 : ttl;
    await redis.set(key, buf, "EX", effectiveTtl);
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
 * @param {boolean} [deferStore=false] - return fetch result before gzip+SET finishes
 *   (home bundles: Azure RTT store can add ~1s+). Lock held until store completes
 *   in background so waiters still serialize; caller gets data immediately.
 * @param {number} [memoryTtl=0] - optional process-local L1 TTL (seconds); 0 = disabled
 * @param {number} [ttl=60] - Redis TTL in seconds. null/<=0 is coerced to 60 — never immortal.
 */
async function cache({ namespace, params = {}, ttl = 60, fetchFn, deferStore = false, memoryTtl = 0 }) {
  // Never allow immortal Redis keys — orphans that never refresh are worse than a miss.
  // Callers that used to pass ttl:null now get a short safety TTL.
  if (ttl == null || ttl <= 0) ttl = 60;

  const key = buildKey(namespace, params);

  if (memoryTtl > 0) {
    const mem = l1Get(key);
    if (mem !== null) {
      console.log(`🟢 L1 HIT -> ${key}`);
      return mem;
    }
  }

  if (!isRedisUp()) {
    console.log(`⚠️ BYPASS (Redis down) -> ${key}`);
    const fresh = await fetchFn();
    if (memoryTtl > 0) l1Set(key, fresh, memoryTtl);
    return fresh;
  }

  let existing = null;

  try {
    existing = await getJson(key);
  } catch { }

  if (existing) {
    console.log(`🟢 CACHE HIT -> ${key}`);
    if (memoryTtl > 0) l1Set(key, existing, memoryTtl);
    return existing;
  }

  console.log(`🔵 CACHE MISS -> ${key}`);

  const lock = await acquireLock(key, 5);

  if (!lock) {
    // Producer sets L1 before Azure SET — poll memory briefly so concurrent
    // waiters avoid the full 120ms sleep + Redis RTT under load.
    if (memoryTtl > 0) {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 15));
        const mem = l1Get(key);
        if (mem !== null) {
          console.log(`🟢 L1 HIT (wait) -> ${key}`);
          return mem;
        }
      }
    } else {
      await new Promise((r) => setTimeout(r, 120));
    }
    const waited = (await getJson(key)) ?? (await fetchFn());
    if (memoryTtl > 0) l1Set(key, waited, memoryTtl);
    return waited;
  }

  try {
    const fresh = await fetchFn();
    const isEmpty =
      fresh === null ||
      fresh === undefined ||
      (Array.isArray(fresh) && fresh.length === 0);

    // Empty arrays used to skip store → every home cold re-paid Azure Redis miss +
    // Mongo (~1s for banners/pinned). Negative-cache empties briefly so admins
    // adding rows are visible within a minute.
    const storeTtl = isEmpty ? Math.min(ttl, 60) : ttl;

    if (isEmpty) {
      console.log(`⚠️ NEG-CACHE empty -> ${key} (ttl=${storeTtl}s)`);
    }

    // Populate L1 before Redis store so warm path never waits on Azure SET
    if (memoryTtl > 0) l1Set(key, fresh, memoryTtl);

    // If invalidate cleared this lock while we were fetching, do not rewrite stale data.
    // On deferStore, do this check inside the background task so we don't add an Azure RTT
    // on the HTTP critical path (~200–300ms).
    const ensureLockAndStore = async () => {
      try {
        const currentLock = await redis.get(`lock:${key}`);
        if (currentLock !== lock) {
          console.log(`⚠️ SKIP STORE (lock lost / invalidated) -> ${key}`);
          await releaseLock(key, lock);
          return;
        }
      } catch { }

      try {
        await setJson(key, fresh, storeTtl);
        console.log(`🧩 STORED -> ${key}`);
      } catch { }
      await releaseLock(key, lock);
    };

    if (deferStore) {
      setImmediate(() => {
        void ensureLockAndStore();
      });
      return fresh;
    }

    await ensureLockAndStore();
    return fresh;
  } catch (err) {
    await releaseLock(key, lock);
    throw err;
  }
}


/**
 * INVALIDATE
 * Always deletes the exact key + lock first (reliable).
 * SCAN is best-effort for prefix matches and must not block/skip exact DEL.
 */
async function invalidate(prefix) {
  l1ClearPrefix(prefix);

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

/**
 * Flush every application cache key (L1 + Redis).
 * Preserves engagement buffers (`buffer:*`) and avoids FLUSHDB so Socket.IO
 * pub/sub on the same Redis instance is not wiped mid-flight.
 */
function isProtectedRedisKey(key) {
  if (!key || typeof key !== "string") return true;
  if (key.startsWith("buffer:")) return true;
  // Socket.IO Redis adapter / pub-sub bookkeeping
  if (key.startsWith("socket.io")) return true;
  return false;
}

async function flushAllCaches() {
  l1ClearPrefix(); // wipe process-local L1 entirely

  if (!isRedisUp()) {
    console.log("⚠️ FLUSH ALL SKIPPED (Redis down) — L1 cleared only");
    return { ok: true, redisUp: false, deleted: 0 };
  }

  let deleted = 0;

  try {
    const matched = [];
    const stream = redis.scanStream({ match: "*", count: 500 });

    await Promise.race([
      new Promise((resolve, reject) => {
        stream.on("data", (keys) => {
          for (const k of keys) {
            if (!isProtectedRedisKey(k)) matched.push(k);
          }
        });
        stream.on("end", resolve);
        stream.on("error", reject);
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("SCAN timeout")), 15000)
      ),
    ]);

    // Batch DELs to avoid huge pipelines
    const BATCH = 200;
    for (let i = 0; i < matched.length; i += BATCH) {
      const chunk = matched.slice(i, i + BATCH);
      if (!chunk.length) continue;
      const n = await redis.del(...chunk);
      deleted += Number(n) || 0;
    }

    console.log(`🧹 FLUSH ALL CACHES -> deleted=${deleted} (skipped buffers/socket.io)`);
    return { ok: true, redisUp: true, deleted };
  } catch (err) {
    console.log("⚠️ FLUSH ALL FAILED", err?.message || err);
    return { ok: false, redisUp: true, deleted, error: err?.message || String(err) };
  }
}

module.exports = {
  cache,
  invalidate,
  flushAllCaches,
  buildKey,
  acquireLock,
  releaseLock,
  pushBuffer,
  popBufferBatch,
  l1ClearPrefix,
  setJson,
};
