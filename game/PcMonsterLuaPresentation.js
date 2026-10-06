/** Exact current-client monster glow/effect presentation bridge. */
import * as THREE from 'three';
import {pcBitmapTexture} from '../data/PcBitmapLuaOwners.js';
import {customMonsterGlow,customMonsterEffects} from '../data/CurrentClientMonsterOwners.js';

export function pcMonsterGlowPlan(monsterClass){
  const g=customMonsterGlow(monsterClass); if(!g)return null;
  return Object.freeze({monsterClass:Number(monsterClass),layer:g.layer,flags:g.meshType,color:Object.freeze([g.r,g.g,g.b]),owner:g.owner});
}
export function pcMonsterEffectPlan(monsterClass){
  const rows=customMonsterEffects(monsterClass)||[];
  return Object.freeze(rows.map(r=>Object.freeze({...r,chancePercent:r.randTime===100?100:Math.max(0,Math.min(100,r.randTime))})));
}

export async function attachPcMonsterLuaPresentation(renderer,monsterClass){
  if(!renderer)return null; const owners=[];
  const glow=pcMonsterGlowPlan(monsterClass);
  if(glow){
    renderer.setBodyLight?.(new THREE.Color(...glow.color));
    const pass=renderer.createOverlayPass?.(glow.flags,{color:new THREE.Color(...glow.color),meshFilter:(mesh)=>Number(mesh?.userData?.muMeshIndex)===glow.layer,passOrder:2});
    if(pass)owners.push({kind:'glow',owner:pass,plan:glow});
  }
  const effects=pcMonsterEffectPlan(monsterClass); const spriteRows=[]; const particleRows=[]; const unresolved=[];
  for(const rule of effects){
    const map=await pcBitmapTexture(rule.effectId); if(!map){unresolved.push(Object.freeze({...rule,reason:'bitmap-id-unresolved'}));continue;}
    if(rule.type===1){
      const particle=renderer.createBoneParticle?.({boneIndex:rule.bone,map,scale:rule.size,color:new THREE.Color(rule.r,rule.g,rule.b),subtype:rule.effectLv,emitMs:40,poolSize:5});
      if(!particle){unresolved.push(Object.freeze({...rule,reason:'bone-or-bitmap-invalid'}));continue;}
      particleRows.push({particle,rule}); owners.push({kind:'particle',owner:particle,plan:rule});
      continue;
    }
    const sprite=renderer.createBoneSprite?.({boneIndex:rule.bone,map,scale:rule.size,color:new THREE.Color(rule.r,rule.g,rule.b)});
    if(!sprite){unresolved.push(Object.freeze({...rule,reason:'bone-or-bitmap-invalid'}));continue;}
    // MonsterEffect.cpp passes Black as CreateSprite rotation.
    if(sprite.material) sprite.material.rotation=Number(rule.black)||0;
    spriteRows.push({sprite,rule}); owners.push({kind:'sprite',owner:sprite,plan:rule});
  }
  const update=()=>{
    for(const row of spriteRows){
      const chance=row.rule.randTime===100?true:(Math.floor(Math.random()*100)<=row.rule.randTime);
      row.sprite.sprite.visible=chance;
    }
    for(const row of particleRows){
      const chance=row.rule.randTime===100?true:(Math.floor(Math.random()*100)<=row.rule.randTime);
      row.particle.setEnabled?.(chance);
    }
  };
  return {owners:Object.freeze(owners),unresolved:Object.freeze(unresolved),update,dispose(){for(const x of owners)x.owner?.dispose?.();}};
}
