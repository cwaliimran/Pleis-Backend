const Redis = require("ioredis");

let redisClient = null;
let redisAvailable = false;

function getRedisClient() {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379";
  const isAzure = url.startsWith("rediss://");

  redisClient = new Redis(url, {
    // DO NOT hard fail requests
    maxRetriesPerRequest: null,
    enableReadyCheck: true,

    retryStrategy(times) {
      // backoff retry (soft)
      return Math.min(times * 500, 5000);
    },

    reconnectOnError() {
      return true;
    },

    ...(isAzure && {
      tls: {
        rejectUnauthorized: false,
      },
    }),
  });

  redisClient.on("connect", () => {
    redisAvailable = true;
    console.log("🚀 Redis connected:", isAzure ? "Azure" : "Local");
  });

  redisClient.on("error", (err) => {
    redisAvailable = false;
    console.error("❌ Redis error:", err);
  });

  return redisClient;
}

function isRedisUp() {
  return redisAvailable;
}

module.exports = { getRedisClient, isRedisUp };
