// ecosystem.config.cjs — PM2 app configuration for Camel
//
// This file is a TEMPLATE checked into the repo.
// deploy.sh generates the real version at /opt/camel/ecosystem.config.cjs
// with APP_DIR substituted to the actual deployment path.
//
// Manual usage (if you are not using deploy.sh):
//   sudo -u camel HOME=/opt/camel pm2 start /opt/camel/ecosystem.config.cjs
//   sudo -u camel HOME=/opt/camel pm2 startup systemd -u camel --hp /opt/camel
//   sudo -u camel HOME=/opt/camel pm2 save

module.exports = {
  apps: [
    {
      name: 'camel-backend',

      // start-backend.sh sources .env.backend (DATABASE_URL etc.) then execs
      // `encore run`. Using a wrapper keeps secrets out of the process list.
      script: '/opt/camel/start-backend.sh',
      interpreter: '/usr/bin/env',
      interpreter_args: 'bash',
      cwd: '/opt/camel/backend',

      // Process health
      autorestart: true,
      watch: false,           // don't watch files in production
      restart_delay: 5000,    // 5 s back-off before restart
      max_memory_restart: '512M',

      // Logging — structured logs land here; also available via `pm2 logs`
      error_file: '/opt/camel/logs/backend-error.log',
      out_file:   '/opt/camel/logs/backend-out.log',
      merge_logs: true,
      time: true,             // prefix every log line with a timestamp
    },
  ],
};
