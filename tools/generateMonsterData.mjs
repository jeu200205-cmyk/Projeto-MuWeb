/**
 * generateMonsterData.mjs
 * Materializa módulos ES REAIS dos monstros em web-port/data/generated/:
 *
 *  1. RealMonsterStats.js — stats REAIS do servidor (C:\ms\Data\Monster\Monster.txt):
 *     511 classes com nome/level/HP/mana/dano/defesa/velocidades/alcances.
 *     Merge com nomes PT do Npcname (data/generated/RealMonsters.js) p/ classes 84+.
 *
 *  2. MonsterModelMap.js — mapeamento monsterClass → MODEL Type + Object.Scale
 *     extraído do switch CreateMonster da source PC (ZzzCharacter.cpp), idêntico
 *     em PC_ENGINE/ e mu_source/ (validado: 165 classes, 0 diffs).
 *     Regras PC encadeadas:
 *       OpenMonsterModel(Type) (ZzzOpenData.cpp:2468)
 *         → LoadMonsterModel(Index, "Data\Monster\", "Monster", Type+1) (Monsters.cpp:138)
 *         → AccessModel(...,i=Type+1) (LoadData.cpp:21):
 *             i<10 → "%s0%d.bmd"  |  i>=10 → "%s%d.bmd"
 *         → Data\Monster\Monster{NN}.bmd
 *     Classe fora do switch → branch default → OpenMonsterModel(0) (Monster01.bmd).
 *
 * Uso: node tools/generateMonsterData.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(ROOT, 'data', 'generated');

const MONSTER_TXT = 'C:/ms/Data/Monster/Monster.txt';
const ZZZ_CHARACTER_CPP = 'C:/Users/jeu/Documents/Nova pasta/PC_ENGINE/ZzzCharacter.cpp';

const HEADER = (src) => `// GERADO AUTOMATICAMENTE por tools/generateMonsterData.mjs — NÃO EDITAR
// Fonte: ${src}`;

function writeModule(file, body) {
    fs.writeFileSync(path.join(OUT_DIR, file), body, 'utf8');
}

// ---------------------------------------------------------------- 1. Monster.txt (servidor)
// Colunas (header real do arquivo): Index Rate Name Level MaxLife MaxMana DamageMin
// DamageMax Defense MagicDefense AttackRate DefenseRate MoveRange AttackType
// AttackRange ViewRange MoveSpeed AttackSpeed RegenTime Attribute ItemRate
// MoneyRate MaxItemLevel MonsterSkill Resistance1..4
function parseMonsterTxt() {
    const raw = fs.readFileSync(MONSTER_TXT, 'latin1');
    const out = {};
    const F = ['level', 'hp', 'mana', 'dmgMin', 'dmgMax', 'def', 'mDef', 'attackRate',
        'defenseRate', 'moveRange', 'attackType', 'attackRange', 'viewRange',
        'moveSpeed', 'attackSpeed', 'regenTime', 'attribute', 'itemRate',
        'moneyRate', 'maxItemLevel', 'monsterSkill', 'res1', 'res2', 'res3', 'res4'];
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^(\d+)\s+(\d+)\s+"([^"]*)"\s*(.*)$/);
        if (!m) continue; // header/comentários/linhas em branco
        const cls = parseInt(m[1], 10);
        const nums = m[4].trim().split(/\s+/).map(Number);
        if (!Number.isFinite(cls) || nums.length < 10) continue;
        const e = { class: cls, name: m[3].trim() };
        F.forEach((k, i) => { if (i < nums.length && Number.isFinite(nums[i])) e[k] = nums[i]; });
        if (typeof e.level !== 'number' || e.level <= 0) continue; // slot inválido
        out[cls] = e;
    }
    return out;
}

// ---------------------------------------------------------------- 2. switch PC (class→model/scale)
// Porta a extração validada do switch CreateMonster: localiza o bloco
// `TheMapProcess().CreateMonster` → próximo `switch (Type)` → até `CHARACTER* CreateHero`.
// Case N → OpenMonsterModel(M) → classe N usa o model M. Escala:
// `c->Object.Scale = X` do bloco (com ramificações if (Type == N) atribuindo à
// própria classe). randType: `OpenMonsterModel(71 + randType)` com rand()%2.
function parsePcSwitch() {
    const raw = fs.readFileSync(ZZZ_CHARACTER_CPP, 'latin1');
    const lines = raw.split(/\r?\n/);
    const anchor = lines.findIndex((l) => /TheMapProcess\(\)\.CreateMonster/.test(l));
    if (anchor < 0) throw new Error('ZzzCharacter.cpp: TheMapProcess().CreateMonster não encontrado');
    let start = -1;
    for (let i = anchor; i < lines.length; i++) {
        if (/^\s*switch\s*\(\s*Type\s*\)/.test(lines[i])) { start = i; break; }
    }
    if (start < 0) throw new Error('ZzzCharacter.cpp: switch (Type) do CreateMonster não encontrado');
    let end = lines.length - 1;
    for (let i = start; i < lines.length; i++) {
        if (/^\s*CHARACTER\s*\*\s*CreateHero\s*\(/.test(lines[i])) { end = i; break; }
    }

    const classToModel = {};
    const classScale = {};
    const rand2 = [];
    let pending = [];          // cases acumulados desde o último break/emissão
    let emitted = false;        // viu OpenMonsterModel no bloco atual
    let baseScale = null;       // Scale incondicional do bloco
    let curIf = null;           // dentro de if (Type == N)?
    let ifScale = {};           // Scale específico por if (Type == N)

    for (let i = start; i < end; i++) {
        const l = lines[i];
        let m;
        if ((m = l.match(/^\s*case\s+(\d+)\s*:/))) { pending.push(+m[1]); emitted = false; baseScale = null; curIf = null; ifScale = {}; continue; }
        if (/OpenMonsterModel/.test(l)) {
            emitted = true;
            let mm = l.match(/OpenMonsterModel\s*\(\s*(\d+)\s*\)/);
            if (mm) { for (const c of pending) classToModel[c] = +mm[1]; }
            else if ((mm = l.match(/OpenMonsterModel\s*\(\s*(\w+)\s*\+\s*(\w+)\s*\)/))) {
                // 71 + randType (rand()%2) — model alternativo por spawn
                if (mm[1] === '71') { for (const c of pending) { classToModel[c] = 71; if (!rand2.includes(c)) rand2.push(c); } }
                else throw new Error('switch: expressão de model não suportada: ' + mm[1]);
            }
            continue;
        }
        if ((m = l.match(/if\s*\(\s*Type\s*==\s*(\d+)\s*\)/))) { curIf = +m[1]; continue; }
        if (/^\s*else\b/.test(l)) { curIf = null; continue; }
        if ((m = l.match(/->\s*Object\.Scale\s*=\s*([\d.]+)f?\s*;/))) {
            const v = parseFloat(m[1]);
            if (emitted) {
                if (curIf !== null) { if (!(curIf in ifScale)) ifScale[curIf] = v; }
                else if (baseScale === null) baseScale = v;
            }
            continue;
        }
        if (/^\s*break\s*;/.test(l)) {
            if (emitted) {
                for (const c of pending) {
                    if (c in ifScale) classScale[c] = ifScale[c];
                    else if (baseScale !== null) classScale[c] = baseScale;
                }
            }
            pending = []; emitted = false; baseScale = null; curIf = null; ifScale = {};
            continue;
        }
    }
    return { classToModel, classScale, rand2 };
}

// ---------------------------------------------------------------- 3. merge PT names
function loadPtNames() {
    const mod = fs.readFileSync(path.join(OUT_DIR, 'RealMonsters.js'), 'utf8');
    const out = {};
    const re = /"monsterClass"\s*:\s*(\d+),\s*"name"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    while ((m = re.exec(mod)) !== null) out[+m[1]] = JSON.parse('"' + m[2] + '"');
    return out;
}

// ---------------------------------------------------------------- execução
const stats = parseMonsterTxt();
const { classToModel, classScale, rand2 } = parsePcSwitch();
const ptNames = loadPtNames();

const statEntries = Object.values(stats).map((e) => {
    const pt = ptNames[e.class];
    if (pt) e.namePT = pt;
    return e;
});

const body1 = `${HEADER('C:/ms/Data/Monster/Monster.txt (GameServer real — 511 classes) — nomes PT: Data/Local/Por/Npcname_por.txt')}
// ExpReward NÃO existe no Monster.txt deste servidor → derivado em runtime (Monster.js).
export const REAL_MONSTER_STATS = ${JSON.stringify(statEntries, null, 1)};
export const STATS_BY_CLASS = new Map(REAL_MONSTER_STATS.map((e) => [e.class, e]));
export default REAL_MONSTER_STATS;
`;
writeModule('RealMonsterStats.js', body1);

const body2 = `${HEADER('PC_ENGINE/ZzzCharacter.cpp — switch CreateMonster (class→model+scale), idêntico em mu_source/ (0 diffs)')}
// Cadeia PC: OpenMonsterModel(Type) [ZzzOpenData.cpp:2468] → AccessModel(..., Type+1)
// [LoadData.cpp:21] → "Monster{(Type+1)}.bmd" (0-pad < 10) em Data/Monster/.
// Classe fora do switch → default → OpenMonsterModel(0) → Monster01.bmd.
export const CLASS_TO_MODEL = ${JSON.stringify(classToModel, null, 1)};
export const CLASS_SCALE = ${JSON.stringify(classScale, null, 1)};
// Classes com model alternativo por spawn: OpenMonsterModel(71 + rand()%2)
export const RAND2_CLASSES = ${JSON.stringify(rand2)};
export function monsterBmdPath(modelType) {
    const n = modelType + 1; // AccessModel: i = Type+1
    return \`Monster/Monster\${n < 10 ? '0' + n : n}.bmd\`;
}
`;
writeModule('MonsterModelMap.js', body2);

console.log(JSON.stringify({
    statsClasses: statEntries.length,
    mappedClasses: Object.keys(classToModel).length,
    scaledClasses: Object.keys(classScale).length,
    rand2Classes: rand2,
    sanity: {
        'class2=BudgeDragon': stats[2] && stats[2].name === 'Budge Dragon' && stats[2].hp === 60,
        'class0=BullFighter': stats[0] && stats[0].name === 'Bull Fighter' && stats[0].level === 6,
        'class2→model2→Monster03': classToModel[2] === 2,
        'class276→model53': classToModel[276] === 53,
        'class276scale1.45': classScale[276] === 1.45,
        'class3→model9(spider)': classToModel[3] === 9,
    },
}, null, 1));
