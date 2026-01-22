/**
 * ================================
 * Server Bootstrap (FINAL)
 * ================================
 */

require("dotenv").config({
  path: `.env.${process.env.NODE_ENV || "dev"}`,
});

// ---- Global Logger (early) ----
global.logger = require("../backend/helperUtils/logger");

const express = require("express");
const morgan = require("morgan");
const path = require("path");
const moduleAlias = require("module-alias");

// ---- Load module aliases ----
const aliases = require("../aliasConfig/pathAliases.config");
for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(__dirname, "..", target));
}
require("module-alias/register");

// ---- App & Infra Imports ----
const { i18nConfig } = require("./config/i18nConfig");
const { loggerMiddleware } = require("./middlewares/logger");
const { securityMiddleware } = require("./middlewares/security");
const { sendResponse } = require("./helperUtils/responseUtil");

const connectToDB = require("./helperUtils/server-setup");
const { backupMongoDB } = require("./helperUtils/dataBaseBackup");
const { getRedisClient } = require("./config/redis/redisConfig");
const { startCrons } = require("./config/cron");

// ---- Socket Server ----
const { createSocketServer } = require("./config/sockets/socketServer");

// ---- Routes ----
const routes = require("./routes");
const adminRoutes = require("./admin/routes");
const organizerRoutes = require("./organizer/routes");
const appRoutes = require("./routes/appRoutes");
const staffRoutes = require("./routes/staffRoutes");
const webhooksRoutes = require("./commonModules/paymentsIntegrations/paymentsWebhook/routes/webhookRoutes");

// ---- Swagger ----
const swaggerUi = require("swagger-ui-express");
const swaggerFile = require("../swagger/swagger_output.json");

// =======================================================
// Express App
// =======================================================
const app = express();
app.set("trust proxy", 1);

// =======================================================
// Security
// =======================================================
const allowedOrigins = [
  "https://pleis.com",
  "https://www.pleis.com",
  "https://dev.pleis.com",
  "https://www.dev.pleis.com",
  "http://localhost:4003",
  "http://192.168.12.121:4003",
  "https://pleis.vercel.app",
  "https://latex-industry-bridges-wines.trycloudflare.com",
  "https://nelson-sponsor-santa-interact.trycloudflare.com",
  "https://specification-medicine-exec-deaf.trycloudflare.com",
  "https://willow-zealand-currency-fortune.trycloudflare.com",
  "http://192.168.12.121:4003",
  "https://ebook-what-premiere-totals.trycloudflare.com",
  "https://individual-travesti-hockey-cancel.trycloudflare.com",
  "https://handy-floral-implementation-pumps.trycloudflare.com",
  "https://protected-betty-allows-gale.trycloudflare.com",
  "https://personnel-event-waves-alexander.trycloudflare.com",
  "https://glow-task-hood-meditation.trycloudflare.com",
  "https://detective-viruses-manufacture-arrives.trycloudflare.com",
  "https://genome-exploring-browser-brown.trycloudflare.com",
  "https://abraham-pipes-activity-polar.trycloudflare.com",
  "https://integrated-points-inspired-country.trycloudflare.com",
  "http://192.168.13.221:4003",
  "http://192.168.100.65:4003",
  "http://192.168.13.84:4003",
  "http://192.168.100.65:4003",
  "http://192.168.13.128:4003",
  
];

securityMiddleware(app, {
  allowedOrigins,
  adminIPWhitelist: [],
  maxRequestSize: "10mb",
  rateLimitWindow: 15 * 60 * 1000,
  rateLimitMax: 200,
});

// =======================================================
// Middlewares
// =======================================================
app.use(i18nConfig.init);
app.use(loggerMiddleware);
app.use(morgan("dev"));
app.use(express.json());

// =======================================================
// Routes
// =======================================================
app.use("/api/v1/app", appRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/organizer", organizerRoutes);
app.use("/api/v1/app/staff", staffRoutes);
app.use("/api/v1/webhooks", webhooksRoutes);
app.use("/api/v1", routes);

// Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));

// Fallback
app.use((req, res) => {
  sendResponse({
    res,
    statusCode: 404,
    translationKey: "route_not_found",
  });
});

// =======================================================
// Infrastructure Bootstrap
// =======================================================

// Redis (warm up)
getRedisClient();

// Crons
startCrons();

// MongoDB Backup (24h)
setInterval(() => {
  backupMongoDB();
}, 24 * 60 * 60 * 1000);

// =======================================================
// Socket + HTTP Server (SINGLE SOURCE OF TRUTH)
// =======================================================
const server = createSocketServer(app, allowedOrigins);

// =======================================================
// Start Server AFTER DB Connection
// =======================================================
connectToDB(server);
