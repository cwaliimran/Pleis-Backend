module.exports = {
  apps: [
    {
      name: "pleis-backend",

      script: "backend/server.js",

      /**
       * MUST be fork mode on Azure App Service
       */
      exec_mode: "fork",
      instances: 1,

      /**
       * Restart safety
       */
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,

      /**
       * Memory protection
       */
      max_memory_restart: "1024M",

      /**
       * Logging
       * Azure captures stdout/stderr automatically
       */
      output: "/dev/stdout",
      error: "/dev/stderr",

      /**
       * Environment
       * Azure injects PORT automatically
       */
      env: {
        NODE_ENV: "prod",
      },
    },
  ],
};
