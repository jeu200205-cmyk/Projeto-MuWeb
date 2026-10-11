// FIX154: read-only census of every model *declared* by actual client owners.
// It never invents a model or auto-assigns custom horses/Fenrir to a charset.
import { ITEM_MODEL_MAP } from './ItemModelMap.js';
import { currentClientItemOwnerSnapshot } from './CurrentClientItemOwners.js';
import { RemoteAssets } from './RemoteAssets.js';
const COMPANION_MODELS = Object.freeze([
    'Skill/darkspirit.bmd', 'Player/Helper01.bmd',
    'Skill/Rider01.bmd', 'Skill/Rider02.bmd', 'Skill/DarkHorse.bmd',
    'Skill/fenril_red.bmd', 'Skill/fenril_black.bmd',
    'Skill/fenril_blue.bmd', 'Skill/fenril_gold.bmd',
]);
export function modelLane(path) {
    const p = String(path || '').replace(/\\/g, '/');
    if (/^Skill\//i.test(p)) return 'mount-or-pet';
    if (/^Player\//i.test(p)) return 'character-body-or-helper';
    if (/^Item\/Wing/i.test(p)) return 'wings';
    if (/^Item\//i.test(p)) return 'item-or-custom-mount-icon';
    return 'other';
}
export function declaredModelPaths(stock = ITEM_MODEL_MAP, custom = currentClientItemOwnerSnapshot()) {
    const entries = new Map();
    const add = (path, owner, type) => {
        if (!path) return;
        const clean = String(path).replace(/\\/g,'/').replace(/^Data\//i,'');
        if (!/\.bmd$/i.test(clean)) return;
        const key = clean.toLowerCase();
        const entry = entries.get(key) || {path:clean,lane:modelLane(clean),owners:[],types:[]};
        if (!entry.owners.includes(owner)) entry.owners.push(owner);
        if (type != null && entry.types.length < 8) entry.types.push(type);
        entries.set(key, entry);
    };
    for (const [type,path] of Object.entries(stock)) add(path,'PC OpenItems',type);
    for (const [type,rule] of custom) add(rule?.path,rule?.owner||'current-client Lua',type);
    for (const path of COMPANION_MODELS) add(path,'PC companions',null);
    return [...entries.values()];
}
export async function auditModelCoverage({limit = 150} = {}) {
    const entries = declaredModelPaths();
    // Manifest-only audit, no expensive BMD decode nor thousands of HTTP GETs.
    // Unknown manifest is unknown, not a fabricated false positive.
    const manifest = await RemoteAssets._ensureManifest();
    if (!manifest) return {status:'manifest-unavailable',declared:entries.length,
        verified:0,missing:0,missingExamples:[],note:'Data root cannot be audited without live manifest'};
    const byLane = {};
    const missingExamples = [], presentExamples = [];
    let found = 0, missing = 0;
    for (const entry of entries) {
        const physical = await RemoteAssets.resolveExistingPath(entry.path,{exactOnly:true});
        const lane = byLane[entry.lane] ||= {declared:0,found:0,missing:0};
        lane.declared++;
        if (physical) {
            found++;lane.found++;
            if (presentExamples.length < 12) presentExamples.push({requested:entry.path,physical});
        } else {
            missing++;lane.missing++;
            if (missingExamples.length < limit) missingExamples.push(entry);
        }
    }
    const manifestSource=RemoteAssets._manifestSource || 'unknown';
    return {status:manifestSource==='live-data-root'?'live-data-root':'retained-or-unknown-manifest',
        manifestSource,authority:RemoteAssets.authorityKey,
        declared:entries.length,verified:found,missing,byLane,
        missingExamples,presentExamples,
        note:'Exact model availability only. Item icons are NOT proof a mount/pet has a valid in-world CreateBug owner.'};
}
