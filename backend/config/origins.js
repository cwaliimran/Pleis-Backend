const { CORS_BRAND_ORIGINS } = require("./CONSTANTS");

const isDev =
  process.env.NODE_ENV === "dev" ||
  process.env.NODE_ENV === "mobileapps";

/** Strict prod-like envs (CORS allowlist enforced) */
const isProdLike =
  process.env.NODE_ENV === "prod" ||
  process.env.NODE_ENV === "prodtest";

/**
 * Optional comma-separated origins from env (LAN IPs, tunnels, previews).
 * Example: EXTRA_CORS_ORIGINS=https://abc.trycloudflare.com,http://192.168.1.10:4003
 */
const EXTRA_ORIGINS = String(process.env.EXTRA_CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const STATIC_ORIGINS = [...new Set([...CORS_BRAND_ORIGINS, ...EXTRA_ORIGINS])];

/**
 * Cloudflare quick tunnels change hostname every run.
 * Allow them outside real prod so shared frontend previews work.
 * CORS uses the frontend Origin URL — NOT the remote user's IP.
 */
const CLOUDFLARE_TUNNEL_HOST =
  /^https:\/\/[a-z0-9-]+\.(trycloudflare\.com|cfargotunnel\.com)$/i;

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (isDev) return true;
  if (STATIC_ORIGINS.includes(origin)) return true;

  // prodtest / non-prod: allow CF quick tunnels
  if (process.env.NODE_ENV !== "prod" && CLOUDFLARE_TUNNEL_HOST.test(origin)) {
    return true;
  }

  return false;
}

module.exports = {
  isDev,
  isProdLike,
  allowedOrigins: isDev ? [] : STATIC_ORIGINS,
  connectSrc: isDev ? ["*"] : ["'self'", ...STATIC_ORIGINS],
  isOriginAllowed,
  CLOUDFLARE_TUNNEL_HOST,
};
