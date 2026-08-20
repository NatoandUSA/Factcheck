/**
 * PM2 Ecosystem Configuration File
 * OmniSeller Studio VPS Process Manager
 */

module.exports = {
  apps: [
    {
      name: 'omniseller-api',
      script: 'server/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        OMNI_DB_PATH: '/var/lib/omniseller/app.db',
        OMNI_IMPORTS_DIR: '/var/lib/omniseller/imports',
        DOTENV_PATH: '/etc/omniseller/omniseller.env',
        ALLOWED_ORIGINS: 'https://omniseller.theglobalserviceteam.site,http://localhost:3001,http://127.0.0.1:3001'
      }
    }
  ]
};
