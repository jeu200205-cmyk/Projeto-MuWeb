import fs from 'node:fs';
import assert from 'node:assert/strict';
const pet=fs.readFileSync(new URL('../game/PetSystem.js', import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../core/GameApp.js', import.meta.url),'utf8');
for(const token of [
  "PcTerrainAlphaPass",
  "Effect/eff_lightinga01.OZJ",
  "Effect/eff_lightinga02.OZJ",
  "Effect/eff_lightinga03.OZJ",
  "Effect/eff_lightinga04.OZJ",
  "Effect/eff_lightinga05.OZJ",
  "[22,28,36,44]",
  "f > 1.0 && f <= 1.4",
  "f > 4.8 && f <= 5.2",
  "0.6,0.6",
  "rec.alpha -= 0.05",
  "while (rec.frameMs > 200)",
  "this._footThunderPool.pop()",
]) assert.ok(pet.includes(token),`missing Fenrir Foot Thunder contract: ${token}`);
assert.ok(app.includes("terrainHeightAt: (x,z) => this.scene.terrainHeightAt(x,z)"),'PetSystem must use live terrain owner');
const hot=pet.slice(pet.indexOf('_spawnFootThunderAtBone'),pet.indexOf('_updateFenrirFootThunder'));
assert.ok(!hot.includes('new THREE.PlaneGeometry'),'hot path must not allocate PlaneGeometry');
assert.ok(!hot.includes('new THREE.MeshBasicMaterial'),'hot path must not allocate material');
console.log('PASS FIX93 Fenrir Foot Thunder: PC bones/action windows + 5-frame terrain-alpha pooled owner');
