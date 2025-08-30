require("dotenv").config({ path: `.env.${process.env.NODE_ENV || "dev"}` });

const express = require("express");
const morgan = require("morgan");
const cors = require("cors");

const { i18nConfig } = require("./config/i18nConfig");
const { loggerMiddleware } = require("./middlewares/logger");
const routes = require("./routes");
const adminRoutes = require("./admin/routes");
const { sendResponse } = require("./helperUtils/responseUtil");
const connectToDB = require("./helperUtils/server-setup");

// Express app
const app = express();

// Enable CORS middleware
const corsOptions = {
  origin: "*", // Allow all origins
  methods: "*", // Allow all methods
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-access-token"],
};

app.use(cors(corsOptions)); // Apply CORS middleware


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

//export app
// module.exports = { app };
