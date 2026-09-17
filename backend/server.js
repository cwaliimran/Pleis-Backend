/**
 * ------------------------------------------------
 * Unified Logging (FIRST – before anything else)
 * ------------------------------------------------
 */
require("./config/logging");
const {
  logger,
  crashLogger,
  accessLogger,
} = require("./config/logging");

// expose globally (safe + intentional)
global.logger = logger;

/**
 * ------------------------------------------------
 * Env
 * ------------------------------------------------
 */
require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "dev"}`,
});

require("express-async-errors");
const express = require("express");
const morgan = require("morgan");
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

/**
 * ------------------------------------------------
 * App & Infra Imports
 * ------------------------------------------------
 */
const { i18nConfig } = require("./config/i18nConfig");
const { securityMiddleware } = require("./middlewares/security");
const { initTextModeration } = require("./services/moderation/textModeration");
const { textModerationMiddleware } = require("./services/moderation/textModeration");

const { sendResponse } = require("./helperUtils/responseUtil");

const connectToDB = require("./helperUtils/server-setup");
const { backupMongoDB } = require("./helperUtils/dataBaseBackup");
const { getRedisClient } = require("./config/redis/redisConfig");
const { startCrons } = require("./config/cron");
require('./bullmq');


/**
 * ------------------------------------------------
 * Socket Server
 * ------------------------------------------------
 */
const { createSocketServer } = require("./config/sockets/socketServer");

/**
 * ------------------------------------------------
 * Routes
 * ------------------------------------------------
 */
const routes = require("./routes");
const adminRoutes = require("./admin/routes");
const organizerRoutes = require("./organizer/routes");
const appRoutes = require("./routes/appRoutes");
const staffRoutes = require("./routes/staffRoutes");
const webhooksRoutes =
  require("./commonModules/paymentsIntegrations/paymentsWebhook/routes/webhookRoutes");

/**
 * ------------------------------------------------
 * Swagger
 * ------------------------------------------------
 */
const swaggerUi = require("swagger-ui-express");
const swaggerFile = require("../swagger/swagger_output.json");
const { allowedOrigins } = require("./config/origins");

/**
 * =======================================================
 * Express App
 * =======================================================
 */

const app = express();
// Behind Azure App Service / Front Door: req.ip must be the real client,
// otherwise every user shares one rate-limit bucket (the proxy IP).
// Set TRUST_PROXY_HOPS=2 if you have Front Door → App Gateway → App.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 1);
app.set("trust proxy", Number.isFinite(trustProxyHops) ? trustProxyHops : 1);

/**
 * ------------------------------------------------
 * Health & Root
 * ------------------------------------------------
 */
app.get("/api", (req, res) => {
  res.json({
    name: "Pleis API",
    version: "v1",
    status: "running",
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
  });
});

/**
 * =======================================================
 * Security
 * =======================================================
 */
securityMiddleware(app, {
  allowedOrigins,
  adminIPWhitelist: [],
  // JSON body cap — uploads should use multer, not huge JSON payloads
  maxRequestSize: process.env.MAX_REQUEST_SIZE || "1mb",
  rateLimitWindow: 15 * 60 * 1000,
  // Global ceiling per client IP/user; per-route limiters are stricter
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 400),
});


/**
 * =======================================================
 * Middlewares
 * =======================================================
 */
app.use(i18nConfig.init);

// ✅ unified access logs
app.use(accessLogger);

// request line in every env (Azure / PM2 log stream)
app.use(morgan(process.env.NODE_ENV === "prod" ? "combined" : "dev"));

// Body parsing is configured in securityMiddleware (with size limits) — do not re-add express.json() here
app.use(textModerationMiddleware);

/**
 * =======================================================
 * Routes
 * =======================================================
 */
app.use("/api/v1/app", appRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/organizer", organizerRoutes);
app.use("/api/v1/app/staff", staffRoutes);
app.use("/api/v1/webhooks", webhooksRoutes);
app.use("/api/v1", routes);

// Swagger — never expose full API surface on production
if (process.env.NODE_ENV !== "prod") {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));
}

// Fallback
app.use((req, res) => {
  sendResponse({
    res,
    statusCode: 404,
    translationKey: "route_not_found",
  });
});

/**
 * =======================================================
 * Global Express Error Handler
 * =======================================================
 */
app.use((err, req, res, next) => {
  logger.error("Request error", {
    method: req.method,
    path: req.originalUrl,
    error: err.message,
    stack: err.stack,
  });

  sendResponse({
    res,
    statusCode: 500,
    translationKey: "internal_server_error",
    error: err,
  });
});


/**
 * =======================================================
 * Socket + HTTP Server
 * =======================================================
 */
const server = createSocketServer(app, allowedOrigins);


const PORT = process.env.PORT || 8080;

server.listen(PORT, () => {
  logger.info("HTTP server listening", {
    port: PORT,
    env: process.env.NODE_ENV,
  });
});


/**
 * =======================================================
 * Start Server AFTER DB Connection
 * =======================================================
 */

(async () => {
  try {
    await connectToDB();
    await initTextModeration();
    getRedisClient();
    startCrons();

    setInterval(backupMongoDB, 24 * 60 * 60 * 1000);
  } catch (err) {
    crashLogger.fatal("Startup failure", err);
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
    if (global.io) {
      await global.io.close();
      logger.info("Socket.IO closed");
    }
    process.exit(0);
  } catch (err) {
    logger.error("Error during graceful shutdown", {
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
const {
  isFirebaseTransientNetworkError,
} = require("./config/firebaseAdmin");

process.on("unhandledRejection", (reason) => {
  const error =
    reason instanceof Error ? reason : new Error(String(reason));

  if (isFirebaseTransientNetworkError(error)) {
    // logger.error("Firebase network error (ignored)", {
    //   error: error.message,
    // });
    return;
  }

  crashLogger.fatal("Unhandled Promise Rejection", error);

  setTimeout(() => {
    process.exit(1);
  }, 100);
});

process.on("uncaughtException", (err) => {
  if (isFirebaseTransientNetworkError(err)) {
    // logger.error("Firebase network error (ignored)", {
    //   error: err.message,
    // });
    return;
  }

  crashLogger.fatal("Uncaught Exception", err);

  setTimeout(() => {
    process.exit(1);
  }, 100);
});
