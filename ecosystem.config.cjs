// PM2 process manifest. Run from repo root after `pnpm build`:
//   pm2 start ecosystem.config.cjs
//   pm2 save && pm2 startup    # persist across reboots
module.exports = {
  apps: [
    {
      name: "openclaw-manager-bridge",
      cwd: "./apps/bridge",
      script: "dist/server.js",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      watch: false,
      time: true,
    },
    {
      name: "openclaw-manager-dashboard",
      cwd: "./apps/dashboard",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      env: { NODE_ENV: "production" },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      watch: false,
      time: true,
    },
  ],
};
