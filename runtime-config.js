// Runtime configuration for local development
window.MUWEB_CONFIG = Object.assign({}, window.MUWEB_CONFIG || {}, {
  ASSETS_URL: 'http://127.0.0.1:9100/',
  GATEWAY_URL: 'ws://127.0.0.1:9091',
  GATEWAY_ADMIN_URL: 'ws://127.0.0.1:9090'
});
