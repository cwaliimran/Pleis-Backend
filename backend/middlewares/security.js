// security.js
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const cors = require("cors");
const compression = require("compression");
const express = require("express");
const { isDev, connectSrc } = require("../config/origins");

const securityMiddleware = (app, options = {}) => {
  const {
    allowedOrigins = [],
    adminIPWhitelist = [],
    maxRequestSize = "10mb",
    rateLimitWindow = 15 * 60 * 1000,
    rateLimitMax = 200,
  } = options;

  // CORS must run BEFORE rate limiting so 429 (and other early)
  // responses still include Access-Control-* headers. Otherwise the
  // browser reports a CORS failure instead of the real 429.
  const corsOptions = {
    origin: function (origin, callback) {
      // Same-origin / non-browser / mobile clients may omit Origin
      if (!origin) return callback(null, true);

      if (isDev) {
        // Local + mobile apps: allow any origin (localhost ports vary)
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS Forbidden"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-admin-access-token",
      "X-Timezone",
      "Accept",
      "Origin",
      "X-Requested-With",
    ],
    exposedHeaders: ["RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"],
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsOptions));
  app.options("*", cors(corsOptions));

  // Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc,
        },
      },
      referrerPolicy: { policy: "no-referrer" },
      // API is consumed cross-origin by the web app; same-origin CORP
      // blocks browsers from reading responses and looks like a CORS error.
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  // Prevent HTTP Parameter Pollution
  app.use(hpp());

  // Enable GZIP compression
  app.use(compression());

  // Rate Limiting (after CORS so 429 includes CORS headers)
  // Skip in local/mobile-apps — SPA hits many endpoints from localhost.
  if (!isDev) {
    const limiter = rateLimit({
      windowMs: rateLimitWindow,
      max: rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      // Don't burn quota on CORS preflight
      skip: (req) => req.method === "OPTIONS",
      message: {
        status: 429,
        message: "Too many requests from this IP, please try again later",
      },
    });
    app.use(limiter);
  }

  // Body parser limits (Express)
  app.use(express.json({ limit: maxRequestSize }));
  app.use(express.urlencoded({ extended: true, limit: maxRequestSize }));

  // Optional JSON error for CORS
  app.use((err, req, res, next) => {
    if (err && err.message === "CORS Forbidden") {
      return res.status(403).json({ message: "CORS Forbidden" });
    }
    next(err);
  });

  // Optional: Admin IP whitelist for sensitive routes
  if (adminIPWhitelist.length > 0) {
    app.use("/api/admin", (req, res, next) => {
      const clientIP =
        req.headers["x-forwarded-for"]?.split(",")[0] ||
        req.connection.remoteAddress;
      if (!adminIPWhitelist.includes(clientIP)) {
        return res.status(403).json({ message: "Access denied for this IP" });
      }
      next();
    });
  }

  // Optional: Log suspicious requests
  app.use((req, res, next) => {
    if (!req.ip || !req.method || !req.path) {
      console.warn("Suspicious request detected:", req.ip, req.method, req.path);
    }
    next();
  });
};

module.exports = { securityMiddleware };
