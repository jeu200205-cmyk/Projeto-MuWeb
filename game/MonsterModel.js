/**
 * MonsterModel.js — Visual 3D REAL dos monstros (substitui os cones procedurais).
 *
 * Porte fiel da cadeia PC:
 *   CreateMonster switch (ZzzCharacter.cpp:16173-17916, idêntico em mu_source:13151+)
 *     → OpenMonsterModel(Type) [ZzzOpenData.cpp:2468]
 *     → LoadMonsterModel → AccessModel("Data\Monster\", "Monster", Type+1)
 *     → "Monster{(Type+1)}.bmd" (i<10 0-pad) [LoadData.cpp:21]
 *   Class→model/scale: data/generated/MonsterModelMap.js (gerado da source PC).
 *   Stats reais: data/generated/RealMonsterStats.js (C:\ms Monster.txt).
 *
 * Actions (_define.h:503-511): STOP1=0 STOP2=1 WALK=2 ATTACK1=3 ATTACK2=4
 *   SHOCK=5 DIE=6 APEAR=7. PlaySpeed base do OpenMonsterModel (ZzzOpenData.cpp):
 *   STOP1 .25 | STOP2 .2 | WALK .34 | ATTACK1/2 .33 | SHOCK .5 | DIE .55 (loop).
 *
 * Espaço: MU Z-up, mapa [0,25600]², TERRAIN_SCALE=100 (_define.h:265 — o web-port
 * usa as MESMAS unidades). Object.Scale por classe aplicado direto (PC).
 * Up-axis: container interno applyMuUpAxis() (rot X −90°) — contrato BmdAdapter
 * (mesma técnica do CharacterPreview do player). MU forward (+Y) vira three −Z
 * → facing yaw = atan2(dx,dz) + π (ver Monster.js).
 */

import * as THREE from 'three';
import { MUModelRenderer } from '../assets/MUModelRenderer.js';
import { MUAssets } from '../assets/MUAssetLoader.js';
import { applyMuUpAxis } from '../graphics/BmdAdapter.js';
import { attachPcMonsterLuaPresentation } from './PcMonsterLuaPresentation.js';
import {
    CLASS_TO_MODEL, CLASS_SCALE, RAND2_CLASSES, monsterBmdPath,
} from '../data/generated/MonsterModelMap.js';

export const MONSTER_ACTIONS = {
    STOP1: 0, STOP2: 1, WALK: 2, ATTACK1: 3, ATTACK2: 4, SHOCK: 5, DIE: 6, APPEAR: 7,
};

/** PlaySpeed base por action — ZzzOpenData.cpp (pós-OpenMonsterModel). */
export const MONSTER_PLAY_SPEED = {
    0: 0.25, 1: 0.2, 2: 0.34, 3: 0.33, 4: 0.33, 5: 0.5, 6: 0.55, 7: 0.4,
};

/** monsterClass → model Type. Rand do PC: rand()%2 p/ classes alternativas. */
export function classToModel(monsterClass) {
    if (RAND2_CLASSES.includes(monsterClass)) return 71 + (Math.random() < 0.5 ? 1 : 0);
    return CLASS_TO_MODEL[monsterClass] ?? 0; // default do switch PC → OpenMonsterModel(0)
}

/** Object.Scale por classe (ZzzCharacter.cpp switch); 1 quando o case não define. */
export function classScale(monsterClass) {
    return CLASS_SCALE[monsterClass] ?? 1;
}

/**
 * Cria o visual 3D real de um monstro (por instância; o parse do BMD é cacheado
 * por MUAssets.loadBMD — classes repetidas compartilham os buffers-base).
 * @param {number} monsterClass classe real do servidor (índice do Monster.txt)
 * @returns {Promise<{root:THREE.Group, setAction:(number)=>void, update:(dt)=>void,
 *                     bmdPath:string, modelType:number, renderer:MUModelRenderer}>}
 */
export async function createMonsterVisual(monsterClass, customRule = null) {
    const modelType = customRule?.modelType ?? classToModel(monsterClass);
    const rel = customRule?.path || monsterBmdPath(modelType);
    const bmd = await MUAssets.loadBMD(rel); // fail-closed se o asset não existe
    const renderer = new MUModelRenderer();
    await renderer.initFromBMD(bmd);        // throw se 0 meshes (sem placeholder)

    // root: posição/yaw do jogo | fix: up-axis MU (Z-up) → three (Y-up)
    const root = new THREE.Group();
    const fix = new THREE.Group();
    applyMuUpAxis(fix);
    fix.add(renderer.group);
    root.add(fix);
    root.scale.setScalar(Number.isFinite(customRule?.size) ? customRule.size : classScale(monsterClass));

    let currentAction = -1;
    const luaPresentation = await attachPcMonsterLuaPresentation(renderer, monsterClass).catch((e)=>{ console.warn(`[MonsterModel] Lua presentation ${monsterClass}: ${e.message}`); return null; });
    const visual = {
        root,
        renderer,
        bmdPath: rel,
        modelType,

        setBodyLight(color) { renderer.setBodyLight?.(color); },

        /** Troca de action (índice _define.h). Idempotente; tolera action ausente. */
        setAction(idx) {
            if (idx === currentAction) return;
            currentAction = idx;
            const action = renderer.playAction('action_' + idx);
            if (action) action.timeScale = MONSTER_PLAY_SPEED[idx] ?? 0.25;
            else console.warn(`[MonsterModel] action ${idx} sem tracks em ${rel}`);
        },

        /** AI state do jogo → action PC (idle/chase/walk/attack/die...). */
        setActionFor(aiState) {
            switch (aiState) {
                case 'idle': return visual.setAction(MONSTER_ACTIONS.STOP1);
                case 'chase': case 'return': return visual.setAction(MONSTER_ACTIONS.WALK);
                case 'attack': return visual.setAction(MONSTER_ACTIONS.ATTACK1);
                case 'death': return visual.setAction(MONSTER_ACTIONS.DIE);
                default: return visual.setAction(MONSTER_ACTIONS.STOP1);
            }
        },

        /** Avança a animação da instância (mixer + bone texture). */
        update(dt, elapsed = 0) {
            renderer.update(dt, elapsed);
            luaPresentation?.update?.(dt, elapsed);
        },
        luaPresentation,
        dispose() { luaPresentation?.dispose?.(); renderer.dispose?.(); },
    };
    visual.setAction(MONSTER_ACTIONS.STOP1);
    return visual;
}
