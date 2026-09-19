/**
 * Azure App Service — Worker role (crons + BullMQ consumers + backup).
 *
 * Target app name (create manually): Pleis-worker
 * Startup command: npm run pm2:azure:prod:worker
 *
 * App Settings:
 *   APP_ROLE=worker
 *   Same secrets as API (MONGO, REDIS, MONRI_*, Billko, BASE_URL, etc.)
 * Keep scale-out at 1 instance (fork × 1) so crons are not multiplied.
 */
module.exports = {
  apps: [
    {
      name: "pleis-backend-worker",

      script: "backend/server.js",

      exec_mode: "fork",
      instances: 1,

      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      max_memory_restart: "1024M",

      listen_timeout: 10000,
      kill_timeout: 5000,

      node_args: "--max-old-space-size=1024",

      output: "/dev/stdout",
      error: "/dev/stderr",

      env: {
        NODE_ENV: "prod",
        APP_ROLE: "worker",
      },
    },
  ],
};
