/**
 * ServerStorageMirror.js — owner autoritativo do Warehouse/Storage do PC Main 5.2.
 *
 * Evidência PC:
 * - CNewUIStorageInventory: grid 8x15 (120 slots)
 * - 0x24 ReceiveEquipmentItem SubCode=2 entrega ItemInfo[12] por Index
 * - 0x81 PRECEIVE_STORAGE_GOLD entrega StorageGold/Gold/CurrentWarehouse/WarehouseCount
 * - 0x82 encerra storage; 0x83 status/lock; 0x84 custo/troca de baú
 *
 * Não persiste em localStorage e não fabrica itens/zen. Ao fechar sessão limpa o
 * espelho para impedir que estado velho apareça numa abertura seguinte.
 */
import { decodeServerItemInfo, serverItemView } from './ServerInventoryMirror.js';

export const STORAGE_WIDTH = 8;
export const STORAGE_HEIGHT = 15;
export const STORAGE_CAPACITY = STORAGE_WIDTH * STORAGE_HEIGHT;

export class ServerStorageMirror {
  constructor() {
    this.slots = new Array(STORAGE_CAPACITY).fill(null);
    this.storageGold = 0;
    this.currentWarehouse = 1;
    this.warehouseCount = 1;
    this.locked = false;
    this.correctPassword = false;
    this.open = false;
    this.revision = 0;
    this.itemAttributes = null;
    this._listeners = new Set();
  }

  onChange(fn) {
    if (typeof fn !== 'function') return () => {};
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit(detail = {}) {
    this.revision++;
    for (const fn of Array.from(this._listeners)) {
      try { fn({revision:this.revision, ...detail}); } catch (_) {}
    }
  }

  reset({keepMeta=false} = {}) {
    this.slots.fill(null);
    this.open = false;
    this.locked = false;
    this.correctPassword = false;
    if (!keepMeta) {
      this.storageGold = 0;
      this.currentWarehouse = 1;
      this.warehouseCount = 1;
    }
    this._emit({type:'reset'});
  }

  beginSession() {
    this.open = true;
    this._emit({type:'open'});
  }

  endSession() {
    this.reset({keepMeta:false});
  }

  setItemAttributes(attributes) {
    if (!(attributes instanceof Map)) return false;
    this.itemAttributes = new Map(Array.from(attributes, ([k,v]) => [k, Object.freeze({...v})]));
    this._emit({type:'item-attributes'});
    return true;
  }

  _valid(index) { return Number.isInteger(index) && index >= 0 && index < STORAGE_CAPACITY; }
  get(index) { return this._valid(index) ? this.slots[index] : null; }

  getDisplayItem(index) {
    const view = serverItemView(this.get(index), index);
    const attr = view && this.itemAttributes?.get(view.itemType);
    if (view && attr) Object.assign(view, attr, {type:view.type, itemType:view.itemType});
    return view;
  }

  setItem(index, bytes, {source='0x24/sub2'} = {}) {
    if (!this._valid(index)) return false;
    const decoded = decodeServerItemInfo(bytes);
    if (!decoded) return false;
    this.slots[index] = decoded;
    this._emit({type:'set', index, source});
    return true;
  }

  clearItem(index, {emit=true, source='move'} = {}) {
    if (!this._valid(index)) return false;
    const existed = !!this.slots[index];
    this.slots[index] = null;
    if (emit && existed) this._emit({type:'clear', index, source});
    return existed;
  }

  applyEquipmentItem({subCode, index, item} = {}, pending = null) {
    if (subCode !== 2 || !this._valid(index)) return false;
    const decoded = decodeServerItemInfo(item);
    if (!decoded) return false;
    // A resposta 0x24 informa o DESTINO. A origem só pode ser removida quando
    // ela pertence ao pending single-flight que nós mesmos enviamos.
    if (pending?.srcType === 2 && pending?.srcIndex !== index && this._valid(pending.srcIndex)) {
      this.clearItem(pending.srcIndex, {emit:false, source:'0x24'});
    }
    this.slots[index] = decoded;
    this._emit({type:'move', srcIndex:pending?.srcType===2 ? pending.srcIndex : null, dstIndex:index, source:'0x24'});
    return true;
  }

  applyGold({result, storageGold, gold, currentWarehouse, warehouseCount} = {}) {
    if (Number.isInteger(currentWarehouse) && currentWarehouse > 0) this.currentWarehouse = currentWarehouse >>> 0;
    if (Number.isInteger(warehouseCount) && warehouseCount > 0) this.warehouseCount = warehouseCount >>> 0;
    if (result) this.storageGold = Number(storageGold) >>> 0;
    this._emit({type:'gold', result:!!result, storageGold:this.storageGold, gold:Number(gold)>>>0,
      currentWarehouse:this.currentWarehouse, warehouseCount:this.warehouseCount});
    return true;
  }

  applyStatus(value) {
    switch (value) {
      case 0: this.locked=false; this.correctPassword=false; break;
      case 1: this.locked=true; this.correctPassword=false; break;
      case 12: this.locked=true; this.correctPassword=true; break;
      default: break; // mensagens 10/11/13 pertencem ao owner de message-box
    }
    this._emit({type:'status', value, locked:this.locked, correctPassword:this.correctPassword});
  }

  projectGrid() {
    const cells = new Int16Array(STORAGE_CAPACITY).fill(-1);
    const placements = new Map();
    const errors = [];
    for (let anchor=0; anchor<STORAGE_CAPACITY; anchor++) {
      const item=this.slots[anchor]; if (!item) continue;
      const dim=this.itemAttributes?.get(item.itemType);
      if (!dim || !Number.isInteger(dim.width) || !Number.isInteger(dim.height) || dim.width<1 || dim.height<1 || dim.width>8 || dim.height>15) {
        errors.push({anchor,reason:'missing-dimensions'}); continue;
      }
      const x=anchor%8, y=Math.floor(anchor/8);
      if (x+dim.width>8 || y+dim.height>15) { errors.push({anchor,reason:'bounds'}); continue; }
      const occupied=[];
      for (let dy=0;dy<dim.height;dy++) for (let dx=0;dx<dim.width;dx++) occupied.push((y+dy)*8+x+dx);
      if (occupied.some(i=>cells[i]!==-1)) { errors.push({anchor,reason:'overlap'}); continue; }
      for (const i of occupied) cells[i]=anchor;
      placements.set(anchor,{anchor,x,y,width:dim.width,height:dim.height});
    }
    return {cells,placements,errors,valid:errors.length===0};
  }

  resolveAnchor(index) {
    if (!this._valid(index)) return -1;
    const g=this.projectGrid();
    return g.valid && g.cells[index]>=0 ? g.cells[index] : index;
  }

  findEmptySlot(itemType) {
    if (!this.itemAttributes) return -1;
    for (let i=0;i<STORAGE_CAPACITY;i++) if (this.canPlace(itemType,i,-1)) return i;
    return -1;
  }

  canPlace(itemType, destination, source=-1) {
    if (!this._valid(destination) || !this.itemAttributes) return false;
    const dim=this.itemAttributes.get(itemType); if (!dim) return false;
    const x=destination%8, y=Math.floor(destination/8);
    if (x+dim.width>8 || y+dim.height>15) return false;
    const g=this.projectGrid(); if (!g.valid) return false;
    for (let dy=0;dy<dim.height;dy++) for (let dx=0;dx<dim.width;dx++) {
      const owner=g.cells[(y+dy)*8+x+dx]; if (owner!==-1 && owner!==source) return false;
    }
    return true;
  }

  buildMoveData(srcType, srcIndex, dstType, dstIndex, serverInventory) {
    let item=null;
    if (srcType===2) item=this.get(srcIndex);
    else if (srcType===0) item=serverInventory?.get?.(srcIndex) || null;
    if (!item) return null;
    if (dstType===2 && !this.canPlace(item.itemType, dstIndex, srcType===2 ? srcIndex : -1)) return null;
    return {
      srcType, srcIndex,
      itemType:item.raw[0]&0xff,
      level:item.rawLevel,
      durability:item.durability,
      option1:item.option1,
      extOption:item.extOption,
      splitType:item.splitType,
      spareBits:item.spareBits,
      socketOptions:Uint8Array.from(item.sockets),
      dstType, dstIndex,
    };
  }
}

export default ServerStorageMirror;
