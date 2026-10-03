// tools/dev-web-server.cjs — servidor DEV da árvore EXATA do web-port, sem cache.
// Uso: node tools/dev-web-server.cjs 8080
// Não mata nenhum processo. Se a porta estiver ocupada, falha e informa claramente.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || 8080);
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.cjs':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.wasm':'application/wasm',
};
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const cleanPath = (url) => decodeURIComponent((url || '/').split('?')[0]);

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/__muweb_runtime.json')) {
    const critical = ['index.html','node_modules/three/build/three.module.js','node_modules/ws/package.json','gateway-server.cjs','core/GameApp.js','graphics/Scene.js','graphics/MuTerrain.js','scenes/SceneManager.js','scenes/ServerSelectScene.js','scenes/CharSelectScene.js','scenes/LoginScene.js','ui/MUVirtualViewport.js','world/TerrainWorld.js','world/TerrainObjectWorld.js','graphics/CharacterPreview.js'];
    const files = {};
    for (const rel of critical) {
      try { const b = fs.readFileSync(path.join(ROOT, rel)); files[rel] = { sha256: sha256(b), bytes: b.length }; }
      catch (e) { files[rel] = { error: e.message }; }
    }
    res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
    return res.end(JSON.stringify({ root: ROOT, pid: process.pid, port: PORT, files }, null, 2));
  }
  let rel = cleanPath(req.url || '/');
  if (rel === '/') rel = '/index.html';
  const full = path.resolve(ROOT, '.' + rel);
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Cache-Control':'no-store' }); return res.end('Forbidden');
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Cache-Control':'no-store' }); return res.end('Not found'); }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-MUWeb-Root': ROOT,
    });
    fs.createReadStream(full).pipe(res);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[MUWEB DEV] porta ${PORT} já está ocupada. Não mate processos às cegas.`);
    console.error(`Descubra o PID que escuta ${PORT}, confirme o caminho dele e encerre SOMENTE esse servidor se for a cópia antiga.`);
  } else console.error(e);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[MUWEB DEV] root EXATO: ${ROOT}`);
  console.log(`[MUWEB DEV] http://127.0.0.1:${PORT}/`);
  console.log('[MUWEB DEV] Cache-Control: no-store');
});
