require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "dev"}` });
global.logger = require("../backend/helperUtils/logger");

const express = require("express");
const morgan = require("morgan");

// --- Load aliases dynamically from config ---
const path = require("path");
const moduleAlias = require("module-alias");
const aliases = require("../aliasConfig/pathAliases.config");

for (const [alias, target] of Object.entries(aliases)) {
  moduleAlias.addAlias(alias, path.join(__dirname, "..", target));
}

require('module-alias/register');


const { i18nConfig } = require("./config/i18nConfig");
const { loggerMiddleware } = require("./middlewares/logger");
const routes = require("./routes");
const adminRoutes = require("./admin/routes");
const organizerRoutes = require("./organizer/routes");
const appRoutes = require("./routes/appRoutes");
const { sendResponse } = require("./helperUtils/responseUtil");
const connectToDB = require("./helperUtils/server-setup");
const { backupMongoDB } = require("./helperUtils/dataBaseBackup.js");
const { securityMiddleware } = require("./middlewares/security.js");

const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('../swagger/swagger_output.json');


// Express app
const app = express();

app.set("trust proxy", 1); // trust first proxy to get correct IP in req.ip

// ================== Security Middleware ================== //
const allowedOrigins = [
  "https://pleis.com",
  "https://www.pleis.com",
  "https://dev.pleis.com",
  "https://www.dev.pleis.com",
  "http://localhost:4003",
  "https://pleis.vercel.app",
  "https://telecom-occasion-granted-highlight.trycloudflare.com",
  "http://192.168.15.141:4003",
];
securityMiddleware(app, {
  allowedOrigins,
  adminIPWhitelist: [], // Example whitelist
  maxRequestSize: "10mb",
  rateLimitWindow: 15 * 60 * 1000, // 15 minutes
  rateLimitMax: 200, // max requests per window
});


app.use(i18nConfig.init);
app.use(loggerMiddleware);
if (process.env.NODE_ENV != "prod") {
}
app.use(morgan("dev"));
app.use(express.json());



// Routes



//app routes
app.use("/api/v1/app", appRoutes);
// Admin routes
app.use("/api/v1/admin", adminRoutes);
// Organizer routes
app.use("/api/v1/organizer", organizerRoutes);

app.use("/api/v1", routes);



app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

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
