/**
 * Map request paths to product surface for centralized log tracking.
 * Order matters: more specific prefixes first (staff under /app/staff).
 */
function resolveSurface(urlPath = "") {
  const path = String(urlPath).split("?")[0];

  if (path.startsWith("/api/v1/app/staff") || path.startsWith("/api/v1/staff")) {
    return "staff";
  }
  if (path.startsWith("/api/v1/admin")) return "admin";
  if (path.startsWith("/api/v1/organizer")) return "organizer";
  if (path.startsWith("/api/v1/app")) return "app";
  if (path.startsWith("/api/v1/webhooks")) return "webhook";
  if (path.startsWith("/api/v1")) return "shared";
  if (path.startsWith("/api-docs") || path.startsWith("/health") || path === "/api") {
    return "system";
  }
  return "other";
}

const SURFACES = [
  "admin",
  "app",
  "organizer",
  "staff",
  "webhook",
  "shared",
  "system",
  "other",
];

module.exports = {
  resolveSurface,
  SURFACES,
};
