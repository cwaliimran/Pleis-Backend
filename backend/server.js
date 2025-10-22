require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "dev"}` });
global.logger = require("../backend/helperUtils/logger");

const express = require("express");
const morgan = require("morgan");
const cors = require("cors");

const { i18nConfig } = require("./config/i18nConfig");
const { loggerMiddleware } = require("./middlewares/logger");
const routes = require("./routes");
const adminRoutes = require("./admin/routes");
const { sendResponse } = require("./helperUtils/responseUtil");
const connectToDB = require("./helperUtils/server-setup");
const { backupMongoDB } = require("./helperUtils/dataBaseBackup.js");
const { securityMiddleware } = require("./middlewares/security.js");

// Express app
const app = express();

// ================== Security Middleware ================== //
/* const allowedOrigins = [
  "https://pleis.com",
  "https://www.pleis.com",
  "https://dev.pleis.com",
  "https://www.dev.pleis.com",
  "http://localhost:4003",
];
securityMiddleware(app, {
  allowedOrigins,
  adminIPWhitelist: [], // Example whitelist
  maxRequestSize: "10mb",
  rateLimitWindow: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 200, // max requests per window
});
 */

app.use(i18nConfig.init);
app.use(loggerMiddleware);
if (process.env.NODE_ENV != "prod") {
  app.use(morgan("dev"));
}
app.use(express.json());



// Routes
app.use("/api/v1", routes);
// Admin routes
app.use("/api/v1/admin", adminRoutes);

// Fallback Route
app.use((req, res) => {
  sendResponse({ res, statusCode: 404, translationKey: "route_not_found" });
});

// Connect to DB and start server
connectToDB(app);

// Start MongoDB backup timer (24 hours)
const backupTime = 24 * 60 * 60 * 1000;
setInterval(() => backupMongoDB(), backupTime);

//export app
// module.exports = { app };
