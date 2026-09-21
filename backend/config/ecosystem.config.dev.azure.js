/**
 * Azure App Service (dev) — API role (public HTTP).
 *
 * Prefer direct Node on Azure (pm2-runtime was restart-looping; process showed up as
 * ecosystem.config.dev.azure:0 instead of pleis-backend). Kept for reference / local pm2.
 *
 * Startup command (API app): npm run pm2:azure:dev
 *   → APP_ROLE=api NODE_ENV=dev node backend/server.js
 *
 * App Settings:
 *   APP_ROLE=api
 *   NODE_ENV=dev
 *   Do NOT set PORT to a local value (e.g. 4020); let Azure inject PORT (usually 8080).
 */
module.exports = {
  apps: [
    {
      name: "pleis-backend",

      script: "backend/server.js",

      /**
       * Azure App Service requires fork mode
       * Cluster mode causes port conflicts
       */
      exec_mode: "fork",
      instances: 1,

      /**
       * Restart protection
       */
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      /**
       * Startup / shutdown safety
       */
      listen_timeout: 10000,
      kill_timeout: 5000,

      /**
       * Memory protection
       */
      max_memory_restart: "1024M",

      /**
       * Increase Node heap size
       */
      node_args: "--max-old-space-size=1024",

      /**
       * Logging
       * Azure collects stdout/stderr automatically
       */
      output: "/dev/stdout",
      error: "/dev/stderr",
      merge_logs: true,
      time: true,

      /**
       * Environment variables
       */
      env: {
        NODE_ENV: "dev",
        APP_ROLE: "api",
      },
    },
  ],
};
