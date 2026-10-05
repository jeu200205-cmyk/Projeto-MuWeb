/**
 * ServerCustomPreviewMirror.js — retained F3:72 custom-preview baseline.
 *
 * Wire evidence from the same Main 5.2/custom lineage:
 *   [count:1][viewport:1] + count * 24-byte records
 * record:
 *   name[11], pad[1], petIndex LE16, secondPetIndex LE16, wingIndex LE16,
 *   key LE16, element0 LE16, element1 LE16.
 *
 * This owner deliberately stores protocol truth only. It does not fabricate a
 * BMD path for custom indexes that have not yet been resolved through the real
 * CustomWings/CustomPet tables.
 */
export class ServerCustomPreviewMirror {
  constructor() {
    this.byKey = new Map();
    this.byName = new Map();
    this.revision = 0;
    this.viewport = false;
    this._listeners = new Set();
  }

  onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(detail) {
    this.revision++;
    for (const fn of [...this._listeners]) {
      try { fn({ revision: this.revision, ...detail }); } catch { /* protocol owner cannot be broken by UI */ }
    }
  }

  get(key) { return this.byKey.get((Number(key) || 0) & 0x7FFF) || null; }
  getByName(name) {
    const normalized = String(name || '').trim().toLowerCase();
    return normalized ? (this.byName.get(normalized) || null) : null;
  }

  applySnapshot({ viewport = false, records = [] } = {}, heroKey = null) {
    const normalizedHero = Number.isInteger(heroKey) ? (heroKey & 0x7FFF) : null;
    const preservedHero = viewport && normalizedHero ? this.byKey.get(normalizedHero) : null;
    const next = new Map();
    if (preservedHero) next.set(normalizedHero, preservedHero);
    for (const r of records) {
      if (!r || !Number.isInteger(r.key)) continue;
      const key = r.key & 0x7FFF;
      if (!key) continue;
      next.set(key, Object.freeze({
        key,
        name: String(r.name || '').slice(0, 11),
        petIndex: r.petIndex & 0xFFFF,
        secondPetIndex: r.secondPetIndex & 0xFFFF,
        wingIndex: r.wingIndex & 0xFFFF,
        element: Object.freeze([(r.element?.[0] || 0) & 0xFFFF, (r.element?.[1] || 0) & 0xFFFF]),
      }));
    }
    this.byKey = next;
    const byName = new Map();
    for (const record of next.values()) {
      const normalized = String(record?.name || '').trim().toLowerCase();
      if (normalized) byName.set(normalized, record);
    }
    this.byName = byName;
    this.viewport = !!viewport;
    this._emit({ type: 'snapshot', viewport: this.viewport, count: next.size });
    return next.size;
  }

  clear() {
    if (!this.byKey.size) return;
    this.byKey.clear();
    this.byName.clear();
    this._emit({ type: 'clear' });
  }
}

export default ServerCustomPreviewMirror;
