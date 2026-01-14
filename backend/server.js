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

const { runRecurringEventsCron } = require("../backend/commonModules/events/crons/recurringEvents.core");


require('module-alias/register');


const { i18nConfig } = require("./config/i18nConfig");
const { loggerMiddleware } = require("./middlewares/logger");
const routes = require("./routes");
const adminRoutes = require("./admin/routes");
const organizerRoutes = require("./organizer/routes");
const appRoutes = require("./routes/appRoutes");
const staffRoutes = require("./routes/staffRoutes");
const { sendResponse } = require("./helperUtils/responseUtil");
const connectToDB = require("./helperUtils/server-setup");
const { backupMongoDB } = require("./helperUtils/dataBaseBackup.js");
const { securityMiddleware } = require("./middlewares/security.js");

const swaggerUi = require('swagger-ui-express');
const swaggerFile = require('../swagger/swagger_output.json');
const { getRedisClient } = require("./config/redis/redisConfig");


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
  "http://192.168.12.121:4003",
  "https://pleis.vercel.app",
  " https://latex-industry-bridges-wines.trycloudflare.com",
  "https://nelson-sponsor-santa-interact.trycloudflare.com",
  "https://specification-medicine-exec-deaf.trycloudflare.com",
  "https://willow-zealand-currency-fortune.trycloudflare.com",
  "http://192.168.12.121:4003",
  "https://ebook-what-premiere-totals.trycloudflare.com",
  "https://individual-travesti-hockey-cancel.trycloudflare.com",
  "https://handy-floral-implementation-pumps.trycloudflare.com",
  "https://info-strategies-via-null.trycloudflare.com",
  "https://honolulu-wants-rrp-med.trycloudflare.com",
  "http://192.168.13.220:4003",
  "http://192.168.13.221:4003",
  "http://192.168.100.65:4003",
  "http://192.168.13.84:4003",
  "http://192.168.100.65:4003",
  "http://192.168.13.128:4003",
  
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
// Organizer staff
app.use("/api/v1/app/staff", staffRoutes);

app.use("/api/v1", routes);



app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

// Fallback Route
app.use((req, res) => {
  sendResponse({ res, statusCode: 404, translationKey: "route_not_found" });
});

// Connect to DB and start server
connectToDB(app);
getRedisClient()

// Start MongoDB backup timer (24 hours)
const backupTime = 24 * 60 * 60 * 1000;
setInterval(() => backupMongoDB(), backupTime);


let cronTickCount = 1;
setInterval(async () => {
  try {
    // await runRecurringEventsCron();
    // console.log(`✅ Recurring cron tick complete ${cronTickCount}`);
  } catch (err) {
    console.error(`❌ Recurring cron error ${cronTickCount}`, err);
  }
  cronTickCount++;
}, 5000);

//export app
// module.exports = { app };
