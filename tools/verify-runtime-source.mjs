// tools/verify-runtime-source.mjs
// Compara byte-a-byte (SHA-256) os arquivos locais com o que o HTTP :8080 serve.
// Detecta: cwd errado, cópia antiga, servidor apontando para outra source e proxy/cache stale.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BASE = (process.argv[2] || 'http://127.0.0.1:8080').replace(/\/$/, '');
const FILES = [
  'index.html',
  'node_modules/three/build/three.module.js',
  'node_modules/ws/package.json',
  'gateway-server.cjs',
  'core/GameApp.js',
  'protocol/MUPacketRouter.js',
  'protocol/RealMUProtocol.js',
  'data/RemoteAssets.js',
  'graphics/Scene.js',
  'graphics/BmdAdapter.js',
  'graphics/PlayerComposer.js',
  'assets/MUTextureManager.js',
  'assets/MUAssetLoader.js',
  'assets/MUModelRenderer.js',
  'assets/BmdGeometryPool.js',
  'graphics/MuTerrain.js',
  'scenes/SceneManager.js',
  'scenes/ServerSelectScene.js',
  'scenes/CharSelectScene.js',
  'scenes/LoginScene.js',
  'ui/MUVirtualViewport.js',
  'world/TerrainWorld.js',
  'world/TerrainObjectWorld.js',
  'world/PcLoginObjectPresentation.js',
  'world/PcIndoorVisibility.js',
  'world/PcWorldRegistry.js',
  'world/MapData.js',
  'graphics/CharacterPreview.js',
  'scenes/LoadingScene.js',
  'game/PetSystem.js',
  'game/PlayerViewportManager.js',
  'game/MonsterManager.js',
  'game/Monster.js',
  'game/MonsterModel.js',
  'game/NpcModel.js',
  'graphics/GroundItemLayer.js',
  'graphics/ItemMaterialPresentation.js',
  'graphics/PcItemChromeColors.js',
  'data/CustomItemForceLua.js',
  'data/PcBitmapLuaOwners.js',
  'data/PcBitmapLuaVM.js',
  'vendor/fengari-bitmap-0.1.4.mjs',
  'data/PcLuaCrypt.js',
  'data/CurrentClientMonsterOwners.js',
  'data/PcItemInfo.js',
  'data/PcPlayerBodyModelMap.js',
  'ui2/ItemIconRenderer.js',
  'ui2/InventoryWindow.js',
  'game/SkillEffects.js',
  // R88 retains R87 production skill authority: server F3:11 + skill_por + PC cast router + exact accepted VFX owners.
  'skills/ServerMagicList.js',
  'skills/PcSkillCastRouter.js',
  'data/SkillNames.js',
  'game/PCSkillEffectsPackA.js',
  'graphics/PcRuneAura.js',
  'data/ItemModelResolver.js',
  'world/MapManager.js',
];
// R12.6 fix: lista ANTERIOR referenciava paths de árvore velha (scenes/
// WorldScene.js, world/MapManager.js, data/CharacterEquipmentCodec.js) que
// NÃO existem nesta árvore → 404 garantido → 'MISMATCH 24/24' era ALARME
// FALSO. Validado byte-a-byte 25-09: GameApp/PetSystem/MUModelRenderer/
// PlayerComposer mutados servem MATCH no :8090 (cache mesh:
// server-8090-serves-current-tree-verified). MapManager mora em world/.
// Guarda: fs.readFile sem try/catch derrubava o script com stack crua
// (node:internal/fs/promises:637) quando um entry sumia do disco — agora
// marca FAIL e continua a checagem dos demais arquivos.

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
let failed = 0;
console.log(`[runtime-source] ROOT local: ${ROOT}`);
console.log(`[runtime-source] HTTP: ${BASE}`);

for (const rel of FILES) {
  let local;
  try {
    local = await fs.readFile(path.join(ROOT, rel));
  } catch (e) {
    failed++;
    console.log(`FAIL ${rel}: arquivo local ausente/ilegível: ${e.message}`);
    continue;
  }
  let remote;
  try {
    const sep = rel.includes('?') ? '&' : '?';
    const r = await fetch(`${BASE}/${rel}${sep}nocache=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    remote = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    failed++;
    console.log(`FAIL ${rel}: não foi possível baixar: ${e.message}`);
    continue;
  }
  const a = sha(local), b = sha(remote);
  const ok = a === b;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${rel}`);
  console.log(`  local : ${a} (${local.length} B)`);
  console.log(`  HTTP  : ${b} (${remote.length} B)`);
  if (!ok && rel === 'core/GameApp.js') {
    const txt = remote.toString('utf8');
    const line = txt.split(/\r?\n/).findIndex((x) => x.includes('LOOP VIVO')) + 1;
    console.log(`  HTTP LOOP VIVO line=${line || 'não encontrado'}`);
  }
}

if (failed) {
  console.error(`\nRUNTIME SOURCE MISMATCH: ${failed}/${FILES.length} arquivo(s) divergente(s).`);
  console.error('NÃO depure shader/protocolo antes de fazer o servidor HTTP servir esta mesma árvore.');
  process.exitCode = 2;
} else {
  console.log(`\nRUNTIME SOURCE MATCH: ${FILES.length}/${FILES.length} arquivos críticos servidos são exatamente os desta source.`);
}
