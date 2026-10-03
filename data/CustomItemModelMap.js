/**
 * Compatibility facade for current-client item models.
 *
 * R72 removed the old 2239-row generated table because it included historical
 * / commented LoadItens rows that are not executed by the current client.
 * Runtime authority now comes from the actual encrypted/plain current Data Lua
 * via CurrentClientItemOwners.js. Until that owner loads, custom lookup fails
 * closed and stock Main 5.2 ItemModelMap remains the caller fallback.
 */
import {
  currentClientItemModelForType,
  currentClientItemOwnerMeta,
  currentClientItemOwnerSnapshot,
  loadCurrentClientItemOwners,
} from './CurrentClientItemOwners.js';

export function customItemModelForType(itemType) { return currentClientItemModelForType(itemType); }
export function getCustomItemModelCount() { return currentClientItemOwnerMeta().count; }
export function getCustomItemModelSnapshot() { return currentClientItemOwnerSnapshot(); }
export { loadCurrentClientItemOwners };
export default Object.freeze({ customItemModelForType, getCustomItemModelCount, getCustomItemModelSnapshot, loadCurrentClientItemOwners });
