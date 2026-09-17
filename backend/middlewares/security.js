// security.js
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const cors = require("cors");
const compression = require("compression");
const express = require("express");
const { isDev, connectSrc } = require("../config/origins");
const { createRateLimitStore } = require("../helperUtils/rateLimitStore");
const { clientKey, shouldSkipRateLimit } = require("../helperUtils/rateLimiter");
const { ipBlockMiddleware } = require("./ipBlockMiddleware");
const { recordRateLimited } = require("../services/security/ipThreatService");
const { sendResponse } = require("../helperUtils/responseUtil");

const securityMiddleware = (app, options = {}) => {
  const {
    allowedOrigins = [],
    adminIPWhitelist = [],
    maxRequestSize = "1mb",
    rateLimitWindow = 15 * 60 * 1000,
    rateLimitMax = 300,
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
    exposedHeaders: [
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
      "Retry-After",
    ],
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
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc,
        },
      },
      referrerPolicy: { policy: "no-referrer" },
      // API is consumed cross-origin by the web app; same-origin CORP
      // blocks browsers from reading responses and looks like a CORS error.
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // Prevent HTTP Parameter Pollution
  app.use(hpp());

  // Enable GZIP compression
  app.use(compression());

  // Permanent / temporary IP blocklist (before rate limit)
  app.use(ipBlockMiddleware);

  // Global rate limit (after CORS so 429 includes CORS headers).
  // Per-route createRateLimiter() is stricter for auth / sensitive endpoints.
  if (!shouldSkipRateLimit()) {
    const limiter = rateLimit({
      windowMs: rateLimitWindow,
      max: rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: clientKey,
      store: createRateLimitStore("rl:global:", rateLimitWindow),
      validate: { trustProxy: false },
      skip: (req) => {
        if (req.method === "OPTIONS") return true;
        const path = req.path || "";
        // Health / root / payment webhooks must not share the global bucket
        return (
          path === "/health" ||
          path === "/api" ||
          path.startsWith("/api/v1/webhooks")
        );
      },
      handler: (req, res) => {
        recordRateLimited(req, { endpoint: "global" });
        return sendResponse({
          res,
          statusCode: 429,
          translationKey: "too_many_requests",
          error: {
            message: "Too many requests from this client, please try again later",
          },
        });
      },
    });
    app.use(limiter);
  }

  // Body parser limits (Express) — keep modest to reduce payload DoS;
  // file uploads should use multer, not giant JSON bodies.
  app.use(express.json({ limit: maxRequestSize }));
  app.use(express.urlencoded({ extended: true, limit: maxRequestSize }));

  // Optional JSON error for CORS
  app.use((err, req, res, next) => {
    if (err && err.message === "CORS Forbidden") {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "cors_forbidden",
      });
    }
    // Payload too large
    if (err?.type === "entity.too.large") {
      return sendResponse({
        res,
        statusCode: 413,
        translationKey: "payload_too_large",
      });
    }
    next(err);
  });

  // Optional: Admin IP whitelist for sensitive routes
  if (adminIPWhitelist.length > 0) {
    app.use("/api/admin", (req, res, next) => {
      const clientIP =
        (req.headers["x-forwarded-for"]?.split(",")[0] || "").trim() ||
        req.ip ||
        req.socket?.remoteAddress;
      if (!adminIPWhitelist.includes(clientIP)) {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "access_denied_for_ip",
        });
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
