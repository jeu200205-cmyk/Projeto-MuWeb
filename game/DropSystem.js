// DropSystem.js — Drops no chão: spawn com bounce, despawn c/ blink, pickup automático
import * as THREE from 'three';
import { Item } from '../data/Item.js';
import { Sound } from '../audio/SoundManager.js';

export const DROP_LIFETIME = 60;      // segundos até despawn
export const BLINK_TIME = 10;         // últimos N segundos piscando
export const PICKUP_RADIUS = 1.5;

// Cores de gem por "tipo" de item quando não há ícone
const GEM_COLORS = {
  weapon: 0x99ccff, shield: 0x8899aa, helm: 0xccaa66, armor: 0xcc9944,
  pants: 0xaa7744, gloves: 0xbb8855, boots: 0x996644, wings: 0x66ffee,
  ring: 0xffcc44, potion: 0xff5555, other: 0x55ff88,
};
const EXCELLENT_GLOW = 0xbb44ff; // roxo
const ZEN_GLOW = 0xffcc22;       // dourado

function iconTexture(icon, fallbackColor) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 64);
  if (icon) {
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, 32, 36);
  } else {
    // Losango (gem) colorido
    const c = `#${fallbackColor.toString(16).padStart(6, '0')}`;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(32, 6); ctx.lineTo(56, 32); ctx.lineTo(32, 58); ctx.lineTo(8, 32);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Entidade de drop no mundo */
class DropEntity {
  /**
   * @param {object} data
   * @param {Item|null} data.item  — item dropado
   * @param {number} data.zenAmount — >0 para pilha de zen
   * @param {THREE.Vector3} data.position
   */
  constructor(data) {
    this.item = data.item || null;
    this.zenAmount = data.zenAmount || 0;
    this.position = data.position.clone();
    this.age = 0;
    this.landed = false;
    this.vy = 4 + Math.random() * 2;      // impulso inicial p/ bounce
    this.vx = (Math.random() - 0.5) * 1.5;
    this.vz = (Math.random() - 0.5) * 1.5;
    this.bounces = 0;
    this.mesh = this._buildMesh();
    this.mesh.position.copy(this.position);
    this.mesh.position.y += 1.2; // nasce um pouco acima
  }

  get isZen() { return this.zenAmount > 0; }
  get isExcellent() { return !!(this.item && this.item.isExcellent); }

  _buildMesh() {
    const group = new THREE.Group();

    if (this.isZen) {
      // Pilha de ouro: 3 cilindros dourados empilhados
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd4af37, metalness: 0.8, roughness: 0.25,
        emissive: ZEN_GLOW, emissiveIntensity: 0.35,
      });
      for (let i = 0; i < 3; i++) {
        const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 12), mat);
        coin.position.set((Math.random() - 0.5) * 0.15, 0.07 + i * 0.13, (Math.random() - 0.5) * 0.15);
        coin.rotation.y = Math.random() * Math.PI;
        group.add(coin);
      }
      this.glowColor = ZEN_GLOW;
    } else {
      const icon = this.item.icon && this.item.icon !== '📦';
      let plane;
      if (icon) {
        const tex = iconTexture(this.item.icon);
        plane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.7, 0.7),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
        );
      } else {
        const color = this.isExcellent ? EXCELLENT_GLOW : (GEM_COLORS[this.item.type] || 0x55ff88);
        plane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.55, 0.55),
          new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.5, side: THREE.DoubleSide,
          })
        );
      }
      plane.position.y = 0.45;
      this.billboard = plane;
      group.add(plane);
      this.glowColor = this.isExcellent ? EXCELLENT_GLOW : null;
    }

    // Glow no chão (excellent = roxo, zen = dourado)
    if (this.glowColor) {
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(0.8, 20),
        new THREE.MeshBasicMaterial({
          color: this.glowColor, transparent: true, opacity: 0.28,
          depthWrite: false,
        })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      this.glowMesh = glow;
      group.add(glow);
    }
    return group;
  }

  update(dt) {
    this.age += dt;
    const m = this.mesh;
    if (!this.landed) {
      // Gravidade + bounce
      this.vy -= 20 * dt;
      m.position.x += this.vx * dt;
      m.position.z += this.vz * dt;
      m.position.y += this.vy * dt;
      const floor = this.position.y;
      if (m.position.y <= floor) {
        m.position.y = floor;
        this.bounces++;
        if (Math.abs(this.vy) > 1.2 && this.bounces < 3) {
          this.vy = -this.vy * 0.45;
          this.vx *= 0.6; this.vz *= 0.6;
          Sound.playBeep(520, 0.04, 'triangle', 0.06);
        } else {
          this.landed = true;
          this.vy = 0;
        }
      }
    } else {
      // Idle bobbing + rotação do billboard
      if (this.billboard) {
        this.billboard.position.y = 0.45 + Math.sin(this.age * 2.5) * 0.08;
        this.billboard.rotation.y += dt * 1.2;
      }
      if (this.glowMesh) {
        this.glowMesh.material.opacity = 0.22 + Math.sin(this.age * 4) * 0.1;
      }
    }

    // Blink nos últimos segundos
    if (this.age > DROP_LIFETIME - BLINK_TIME) {
      m.visible = Math.sin(this.age * 10) > -0.2;
    }
    return this.age < DROP_LIFETIME;
  }

  dispose() {
    if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
    this.mesh.traverse((o) => {
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
      if (o.geometry) o.geometry.dispose();
    });
  }
}

export class DropManager {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [opts]
   * @param {Inventory} [opts.inventory] — inventário do player (pickup automático)
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.inventory = opts.inventory || null;
    this.drops = [];
    this._listeners = {};
    this.pickupRadius = opts.pickupRadius || PICKUP_RADIUS;
  }

  on(event, fn) {
    (this._listeners[event] = this._listeners[event] || []).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const l = this._listeners[event];
    if (l) this._listeners[event] = l.filter((f) => f !== fn);
  }
  emit(event, data) {
    for (const fn of (this._listeners[event] || []).slice()) fn(data);
  }

  /** Cria um drop de item no mundo */
  spawnItem(item, position) {
    const drop = new DropEntity({ item, position });
    this.scene.add(drop.mesh);
    this.drops.push(drop);
    this.emit('spawn', drop);
    return drop;
  }

  /** Cria uma pilha de zen (dourada) */
  spawnZen(amount, position) {
    const drop = new DropEntity({ zenAmount: Math.floor(amount), position });
    this.scene.add(drop.mesh);
    this.drops.push(drop);
    this.emit('spawn', drop);
    return drop;
  }

  /**
   * Processa a dropTable de um monstro morto.
   * Compatível com Monster.rollDrops(): { item:'zen'|'potion_hp'|'jewel_bless'|nome do ITEM_DB, amount? }
   * Aceita também entradas com 'excellent': true para filtragem/glow.
   */
  handleMonsterDeath(monster) {
    const rolls = typeof monster.rollDrops === 'function' ? monster.rollDrops() : [];
    const base = monster.position.clone();
    const drops = [];
    for (const roll of rolls) {
      const pos = base.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6
      ));
      if (roll.item === 'zen') {
        drops.push(this.spawnZen(roll.amount || 50, pos));
      } else {
        // nomes curtos do dropTable → nomes do ITEM_DB
        const name = DropManager.resolveItemName(roll.item);
        const item = Item.fromName(name, roll.level || 0, {
          excellent: roll.excellent ? ['Increase Damage +2%'] : [],
          luck: !!roll.luck,
        });
        if (item) drops.push(this.spawnItem(item, pos));
      }
    }
    return drops;
  }

  /** Mapeia ids curtos da dropTable para nomes do ITEM_DB */
  static resolveItemName(key) {
    const aliases = {
      potion_hp: 'Small Healing Potion',
      potion_mp: 'Small Mana Potion',
      jewel_bless: 'Jewel of Bless',
      jewel_soul: 'Jewel of Soul',
      jewel_chaos: 'Jewel of Chaos',
      jewel_life: 'Jewel of Life',
    };
    return aliases[key] || key;
  }

  /**
   * Update por frame.
   * @param {number} dt
   * @param {THREE.Vector3} [playerPos] — posição do player para pickup
   * @returns {{ picked: DropEntity[], expired: number }}
   */
  update(dt, playerPos) {
    const picked = [];
    let expired = 0;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      const alive = drop.update(dt);

      // Pickup por proximidade (só após aterrissar)
      if (drop.landed && playerPos &&
          drop.mesh.position.distanceTo(playerPos) <= this.pickupRadius) {
        this._pickup(drop);
        picked.push(drop);
        this.drops.splice(i, 1);
        continue;
      }

      if (!alive) {
        drop.dispose();
        this.drops.splice(i, 1);
        expired++;
      }
    }
    return { picked, expired };
  }

  _pickup(drop) {
    if (drop.isZen) {
      if (this.inventory) this.inventory.addZen(drop.zenAmount);
      Sound.playBeep(1046, 0.08, 'sine', 0.2); // "clink" de zen
    } else {
      let ok = true;
      if (this.inventory) ok = this.inventory.addItem(drop.item) !== -1;
      if (!ok) return; // inventário cheio: drop permanece no chão
      Sound.playBeep(drop.isExcellent ? 1318 : 880, 0.09, 'triangle', 0.2);
    }
    Sound.uiHover();
    this.emit('pickup', { item: drop.item, zen: drop.zenAmount });
    drop.dispose();
  }

  /** Remove todos os drops da cena */
  clear() {
    for (const d of this.drops) d.dispose();
    this.drops = [];
  }
}

export default DropManager;
