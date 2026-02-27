const isDev =
  process.env.NODE_ENV === "dev" ||
  process.env.NODE_ENV === "mobileapps";

const PROD_ORIGINS = [
  "https://pleis.com",
  "https://www.pleis.com",
  "https://dev.pleis.com",
  "https://www.dev.pleis.com",
  "http://localhost:4003",
  "https://pleis.vercel.app",
  "https://requiring-cgi-fog-reason.trycloudflare.com"
];

module.exports = {
  isDev,
  allowedOrigins: isDev ? [] : PROD_ORIGINS,
  connectSrc: isDev ? ["*"] : ["'self'", ...PROD_ORIGINS],
};