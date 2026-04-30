module.exports = {
  apps: [{
    name: 'apps-trendingbulk',
    script: './server.js',
    cwd: '/var/www/html/apps',
    node_args: '--max-old-space-size=200',
    max_memory_restart: '250M',
    max_restarts: 20,
    min_uptime: '30s',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
