// skills/ServerMagicList.js — máquina de estados da magicList F3:11 (PC-fiel).
//
// AUTORIDADE PC (Main 5.2, fonte extraída byte a byte):
//   WSclient.cpp:1175-1245 ReceiveMagicList(BYTE* ReceiveBuffer):
//     - Data->Value == 0xFF → Skill[Data2->Index] = 0            (remove 1 por Index)
//     - Data->Value == 0xFE → Skill[Data2->Index] = Data2->Type  (seta 1 skill)
//     - Data->ListType == 2  → para cada entry: Skill[Index] = 0 (remove listados)
//     - caso base:
//         ListType == 0 → ZeroMemory(Skill, MAX_SKILLS) ANTES de preencher
//         for i < Data->Value: Skill[Index_i] = Type_i
//     - depois: SkillNumber = count(Skill[i] != 0); CurrentSkill reset (>=SkillNumber→0).
//   _define.h:406 MAX_SKILLS = 600 (Skill é WORD[600]).
//   PHEADER_MAGIC_LIST_COUNT: [Value:1][ListType:1] + entries PRECEIVE_MAGIC_LIST
//   [Index:1][Type:WORD LE][Level:1] (pack(1), 4B/entry — parser: MUPacketRouter F3:0x11).
//
// FONTE DE DADOS por wire Type: SkillAttribute[t] = record t de
// Data\Local\Por\Skill_Por.bmd (ZzzInfomation.cpp:256-299 OpenSkillScript —
// 600 registros × 80B, BuxConvert XOR3 FC/CF/AB reiniciada por registro;
// o ReceiveMagicList usa exatamente SkillAttribute[SkillType] no PC,
// WSclient.cpp:1233/1237). A tabela decodificada do arquivo REAL vive em
// skills/SkillAttributeData.js (0d02a4dd, gerada por gen-skill-attribute-table.mjs
// — autoridade; nomes PT-BR reais). R86 remove o catálogo sintético SkillData
// da lane de produção: F3:11 + SkillAttribute são a única autoridade.

import { SKILL_ATTRIBUTE_TABLE } from './SkillAttributeData.js';

export const MAX_SKILLS = 600; // _define.h:406

/**
 * SkillAttribute por wire-type. A tabela gerada (SkillAttributeData.js) é
 * COMPACTA (apenas records nomeados, com campo `type` = índice do registro
 * no arquivo = AT_SKILL_*); este Map restaura a indexação por wire-type
 * que o PC usa em SkillAttribute[SkillType].
 */
export const SKILL_ATTRIBUTE = new Map(SKILL_ATTRIBUTE_TABLE.map((r) => [r.type, r]));

/**
 * Resolve apresentação de um wire-type (SkillAttribute[type] no PC).
 * Fail-closed: type desconhecido/registro sem nome → null (não inventa).
 * Campos do record REAL (skill_por.bmd 80B/registro, _struct.h:301-327):
 * mana/delay(ms PC)/distance(células)/skillUseType/masteryType.
 * @returns {{ wireType:number, name:string, mana:number, damage:number,
 *             energy:number, useType:number, magicIcon:number, distance:number, delay:number,
 *             level:number } | null}
 */
export function resolveSkillByType(wireType) {
    const t = wireType | 0;
    if (t <= 0 || t >= MAX_SKILLS) return null;
    const rec = SKILL_ATTRIBUTE.get(t);
    if (!rec || !rec.name) return null;
    return {
        wireType: t,
        name: rec.name,
        mana: rec.mana | 0,
        damage: rec.damage | 0,
        energy: rec.energy | 0,
        useType: rec.skillUseType | 0,
        magicIcon: rec.magicIcon | 0,
        distance: rec.distance | 0,
        delay: rec.delay | 0,
        level: rec.level | 0,
    };
}

/**
 * Aplica um pacote F3:11 (saída do MUPacketRouter: { value, listType, entries })
 * sobre o estado de skills do personagem (Skill[] do PC → Map index→type aqui).
 *
 * @param {Map<number,number>} skillState índice→type (Skill[] do PC)
 * @param {{value:number, listType:number, entries:Array<{index:number,type:number,level:number}>}} pkt
 * @returns {{ skillNumber:number, changed:boolean, removed:number[] }} resumo PC (SkillNumber)
 */
export function applyMagicList(skillState, pkt) {
    const { value, listType, entries } = pkt;
    let changed = false;

    if (value === 0xFF) {
        // Remove UMA skill por Index (WSclient.cpp:1182-1186)
        const e = entries && entries[0];
        if (e) {
            changed = skillState.delete(e.index) || changed;
        }
    } else if (value === 0xFE) {
        // Seta UMA skill por Index (WSclient.cpp:1187-1191)
        const e = entries && entries[0];
        if (e && e.index < MAX_SKILLS) {
            skillState.set(e.index, e.type);
            changed = true;
        }
    } else if (listType === 2) {
        // Remove as listadas (WSclient.cpp:1192-1199)
        for (const e of entries || []) {
            changed = skillState.delete(e.index) || changed;
        }
    } else {
        // Caso base: ListType==0 limpa TUDO antes de preencher (L1204-1213)
        if (listType === 0) skillState.clear();
        for (const e of entries || []) {
            if (e.index >= MAX_SKILLS) continue;
            skillState.set(e.index, e.type);
        }
        changed = true;
    }

    // SkillNumber = count(Skill[i]!=0) (WSclient.cpp:1223-1239)
    let skillNumber = 0;
    for (const t of skillState.values()) if (t !== 0) skillNumber++;
    return { skillNumber, changed };
}

/**
 * Ordem de renderização da barra: índices de Skill[] ordenados (o PC itera
 * MAX_SKILLS em ordem crescente para a lista de magias — CurrentSkill é
 * índice nessa ordenação; SkillBar web tem 8 slots visíveis).
 *
 * @param {Map<number,number>} skillState
 * @param {number} maxSlots limite de slots da barra (8)
 * @returns {Array<{slot:number, index:number, type:number, level?:number}>}
 */
export function barOrderFromState(skillState, maxSlots = 8) {
    const items = [...skillState.entries()]
        .filter(([, t]) => t !== 0)
        .sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [index, type] of items) {
        if (out.length >= maxSlots) break;
        out.push({ slot: out.length, index, type });
    }
    return out;
}
