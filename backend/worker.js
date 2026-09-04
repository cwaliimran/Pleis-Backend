/**
 * Worker process — BullMQ consumers, node-cron, mongodump.
 * Does not bind Azure PORT / public HTTP / Socket.IO.
 *
 * PROCESS_ROLE=worker is required so cron and workers refuse to start on web.
 */
process.env.PROCESS_ROLE = process.env.PROCESS_ROLE || "worker";

/**
 * ------------------------------------------------
 * Unified Logging (FIRST – before anything else)
 * ------------------------------------------------
 */
require("./config/logging");
const { logger, crashLogger } = require("./config/logging");

global.logger = logger;

/**
 * ------------------------------------------------
 * Env
 * ------------------------------------------------
 */
require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "dev"}`,
});

const os = require("os");
const path = require("path");
const moduleAlias = require("module-alias");

/**
 * ------------------------------------------------
 * Module aliases
 * ------------------------------------------------
 */
const aliases = require("../aliasConfig/pathAliases.config");
for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(__dirname, "..", target));
}
require("module-alias/register");

const connectToDB = require("./helperUtils/server-setup");
const { backupMongoDB } = require("./helperUtils/dataBaseBackup");
const { getRedisClient } = require("./config/redis/redisConfig");
const { startCrons } = require("./config/cron");

let closeWorkers = async () => {};

/**
 * =======================================================
 * Start AFTER DB Connection (workers poll immediately)
 * =======================================================
 */
(async () => {
  try {
    await connectToDB();
    getRedisClient();

    const bullmq = require("./bullmq");
    closeWorkers = bullmq.closeWorkers;

    startCrons();
    setInterval(backupMongoDB, 24 * 60 * 60 * 1000);

    logger.info("Worker process started", {
      env: process.env.NODE_ENV,
      hostname: os.hostname(),
      pid: process.pid,
    });
  } catch (err) {
    crashLogger.fatal("Worker startup failure", err);
    process.exit(1);
  }
})();

/**
 * =======================================================
 * Graceful shutdown (expected)
 * =======================================================
 */
const shutdown = async (signal) => {
  logger.warn("Shutdown signal received", { signal });

  try {
    await closeWorkers();
    logger.info("BullMQ workers closed");
    process.exit(0);
  } catch (err) {
    logger.error("Error during worker graceful shutdown", {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/**
 * =======================================================
 * Crash handlers (unexpected)
 * =======================================================
 */
process.on("unhandledRejection", (reason) => {
  const error =
    reason instanceof Error ? reason : new Error(String(reason));

  crashLogger.fatal("Unhandled Promise Rejection", error);

  setTimeout(() => {
    process.exit(1);
  }, 100);
});

process.on("uncaughtException", (err) => {
  crashLogger.fatal("Uncaught Exception", err);

  setTimeout(() => {
    process.exit(1);
  }, 100);
});
