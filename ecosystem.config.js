module.exports = {
  apps: [{
    name: 'simplydiagnostic-lis',
    script: 'src/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M'
  }]
};
