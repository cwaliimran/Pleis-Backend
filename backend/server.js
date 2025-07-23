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

// ✅ Allow localhost only in development
const allowedOrigins = [
  "https://pleis.com",
  "https://www.pleis.com",
  "wss://pleis.com",
];
if (process.env.NODE_ENV === "dev") {
  allowedOrigins.push("http://localhost:4003");
  allowedOrigins.push("ws://localhost:4004");
  allowedOrigins.push("https://dev.pleis.com");
  allowedOrigins.push("https://www.dev.pleis.com");
  allowedOrigins.push("wss://dev.pleis.com");
}

// ✅ CORS middleware with dynamic origin check
app.use(
  cors({
    origin: function (origin, callback) {
      // console.log("origin", origin);
      if (!origin) return callback(null, true); // ✅ Allow Postman
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"), false);
    },
    methods: "*",
    allowedHeaders: ["Content-Type", "Authorization", "x-admin-access-token"],
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// ✅ Optional: Handle CORS errors gracefully
app.use((err, req, res, next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "CORS Forbidden" });
  }
  next(err);
});


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
