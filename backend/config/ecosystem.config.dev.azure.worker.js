/**
 * Azure App Service (dev) — Worker role (crons + BullMQ consumers + backup).
 *
 * Target app name (create manually): Pleis-backend-dev-worker
 * Startup command: npm run pm2:azure:dev:worker
 *
 * App Settings:
 *   APP_ROLE=worker
 *   Same secrets as API (MONGO, REDIS, MONRI_*, Billko, BASE_URL, etc.)
 * Keep scale-out at 1 instance.
 */
module.exports = {
  apps: [
    {
      name: "pleis-backend-worker",

      script: "backend/server.js",

      /**
       * Azure App Service requires fork mode
       * Cluster mode causes port conflicts
       */
      exec_mode: "fork",
      instances: 1,

      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      listen_timeout: 10000,
      kill_timeout: 5000,

      max_memory_restart: "1024M",

      node_args: "--max-old-space-size=1024",

      output: "/dev/stdout",
      error: "/dev/stderr",
      merge_logs: true,
      time: true,

      env: {
        NODE_ENV: "dev",
        APP_ROLE: "worker",
      },
    },
  ],
};
