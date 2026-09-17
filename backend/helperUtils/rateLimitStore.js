/**
 * Redis-backed store for express-rate-limit v7.
 * Falls back to an in-process Map when Redis is unavailable so a Redis
 * outage does not disable rate limiting (or crash the process).
 *
 * Shared across instances when Redis is up — required for Azure multi-instance.
 */
const { getRedisClient, isRedisUp } = require("../config/redis/redisConfig");

class MemoryFallbackStore {
  constructor(windowMs) {
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  _entry(key) {
    const now = Date.now();
    let entry = this.hits.get(key);
    if (!entry || entry.resetTime <= now) {
      entry = { totalHits: 0, resetTime: now + this.windowMs };
      this.hits.set(key, entry);
    }
    return entry;
  }

  async increment(key) {
    const entry = this._entry(key);
    entry.totalHits += 1;
    return { totalHits: entry.totalHits, resetTime: new Date(entry.resetTime) };
  }

  async decrement(key) {
    const entry = this.hits.get(key);
    if (entry && entry.totalHits > 0) entry.totalHits -= 1;
  }

  async resetKey(key) {
    this.hits.delete(key);
  }
}

class RedisRateLimitStore {
  /**
   * @param {{ prefix?: string, windowMs: number }} opts
   */
  constructor({ prefix = "rl:", windowMs }) {
    this.prefix = prefix;
    this.windowMs = windowMs;
    this.memory = new MemoryFallbackStore(windowMs);
    // express-rate-limit uses this to avoid double-prefixing in some versions
    this.localKeys = false;
  }

  init(options) {
    if (options?.windowMs) {
      this.windowMs = options.windowMs;
      this.memory = new MemoryFallbackStore(options.windowMs);
    }
  }

  _redisKey(key) {
    return `${this.prefix}${key}`;
  }

  async increment(key) {
    if (!isRedisUp()) {
      return this.memory.increment(key);
    }

    try {
      const client = getRedisClient();
      const redisKey = this._redisKey(key);

      const totalHits = await client.incr(redisKey);
      if (totalHits === 1) {
        await client.pexpire(redisKey, this.windowMs);
      }

      let ttl = await client.pttl(redisKey);
      if (ttl < 0) {
        await client.pexpire(redisKey, this.windowMs);
        ttl = this.windowMs;
      }

      return {
        totalHits,
        resetTime: new Date(Date.now() + ttl),
      };
    } catch (err) {
      console.warn("Rate limit Redis increment failed, using memory:", err?.message);
      return this.memory.increment(key);
    }
  }

  async decrement(key) {
    if (!isRedisUp()) {
      return this.memory.decrement(key);
    }
    try {
      const client = getRedisClient();
      const redisKey = this._redisKey(key);
      const n = await client.decr(redisKey);
      if (n < 0) await client.set(redisKey, "0", "PX", this.windowMs, "XX");
    } catch (err) {
      console.warn("Rate limit Redis decrement failed:", err?.message);
      return this.memory.decrement(key);
    }
  }

  async resetKey(key) {
    this.memory.resetKey(key);
    if (!isRedisUp()) return;
    try {
      await getRedisClient().del(this._redisKey(key));
    } catch (err) {
      console.warn("Rate limit Redis resetKey failed:", err?.message);
    }
  }
}

/**
 * Factory used by both global and per-route limiters.
 * @param {string} prefix
 * @param {number} windowMs
 */
function createRateLimitStore(prefix, windowMs) {
  return new RedisRateLimitStore({ prefix, windowMs });
}

module.exports = { createRateLimitStore, RedisRateLimitStore };
