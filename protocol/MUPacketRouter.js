/**
 * MUPacketRouter.js — Roteamento puro dos pacotes MU recebidos (B5).
 * Sem dependências de DOM/Three — testável em Node.
 * Contrato: roteia por headcode com validação de tamanho ANTES de DataView,
 * loga desconhecidos (nunca descarta em silêncio) e emite callbacks por domínio.
 */

import { MAIN_OPCODE, F1_SUBCODE, F4_SUBCODE, LOGIN_RESULT } from './MUOpCodes.js';
import { PACKET_ITEM_LENGTH, decodePacketItemType } from '../data/PacketItemCodec.js';

// R12.5: nomes oficiais PC Main 5.2 p/ subcodes F3 que recebemos mas ainda não
// temos parser na web (autoridade: WSclient.cpp:13157-13247, dispatch 0xF3).
// Serve só p/ logar o sub 1x com o nome certo — comportamento igual ao default
// silencioso do switch PC.

// PACKET_ITEM_LENGTH vem de data/PacketItemCodec.js (WSclient.h:79).

const F3_KNOWN_PC = {
    0x02: 'ReceiveDeleteCharacter',
    0x03: 'ReceiveJoinMapServer',
    0x04: 'ReceiveRevival',
    0x05: 'ReceiveLevelUp',
    0x06: 'ReceiveAddPoint',
    0x07: 'ReceiveDamage',
    0x08: 'ReceivePK',
    0x10: 'ReceiveInventory',
    0x13: 'ReceiveEquipment',
    0x14: 'ReceiveModifyItem',
    0x20: 'ReceiveSummonLife',
    0x22: 'ReceiveWTTimeLeft',
    0x23: 'ReceiveSoccerScore',
    0x24: 'ReceiveWTMatchResult',
    0x25: 'ReceiveWTBattleSoccerGoalIn',
    0x30: 'ReceiveOption',
    0x40: 'ReceiveServerCommand',
    0x50: 'Receive_Master_Level_Exp',
    0x51: 'Receive_Master_LevelUp',
    0x52: 'Receive_Master_LevelGetSkill',
    0xE0: 'ReceiveNewCharacterInfo (custom)',
    0xE1: 'ReceiveCharacterCalculation (custom)',
    0x71: 'GCCustomPreviewCharList (custom)',
    0x72: 'GCCustomPreviewChar (custom)',
    0xE9: 'GCPatentePlayerRecv (custom)',
};
// Anti-flood operacional: loga cada head+sub desconhecido apenas 1x por sessão.
const _loggedUnknownPackets = new Set();

/**
 * @param {object} packet {type, headcode, subcode, size, payload, opcodeName}
 * @param {object} ctx callbacks/contexto: { onLoginResult(code), onChat(msg),
 *                onViewportEnter(name, payload), onPlayerViewport({count,players}),
 *                onMonsterViewport({count,monsters}),
 *                onViewportDelete({count,keys}), onGetItem(), onUnknown(packet), log }
 *                (todos opcionais)
 * @returns {string} ação tomada (p/ testes/auditoria): 'login_result'|'logout'|
 *          'chat'|'viewport_enter'|'monster_viewport'|'viewport_leave'|'get_item'|
 *          'keepalive'|'f1_unknown'|'payload_short'|'unknown'|'null'
 */
export function routeMUPacket(packet, ctx = {}) {
    if (!packet) return 'null';
    const { headcode, subcode, payload, opcodeName } = packet;
    const log = ctx.log || (() => {});

    // Validação de tamanho ANTES de qualquer DataView (exigência P0)
    const need = (n, label) => {
        if (!payload || payload.length < n) {
            log(`[MU] ${opcodeName || '0x' + headcode?.toString(16)}: payload curto p/ ${label} (${payload?.length ?? 0}/${n}) — descartado`, 'warn');
            return false;
        }
        return true;
    };

    switch (headcode) {
        case 0xFA: {
            // Exact LuaSocket custom envelope from current PC client:
            // C2 size head=FA sub=<Lua packet> + PacketName[100] + payload.
            // RealMUProtocol already consumed the C2 subcode byte, so payload
            // starts at the fixed 100-byte packet name.
            if (!need(100, 'customSocketName')) return 'payload_short';
            let end=0; while(end<100 && payload[end]!==0) end++;
            if (end===0 || end>=100) {
                log('[MU] 0xFA custom socket: PacketName inválido — descartado', 'warn');
                return 'payload_short';
            }
            let packetName='';
            for(let i=0;i<end;i++) packetName += String.fromCharCode(payload[i]);
            const body=payload.slice(100);
            const msg={subcode,packetName,payload:body};
            if(subcode===0x48 && packetName==='GS_MoveCustom' && body.length>=10){
                let n=0; while(n<10&&body[n]!==0)n++;
                let name='';for(let i=0;i<n;i++)name+=String.fromCharCode(body[i]);
                msg.moveCustom={namePlayerStaff:name};
            }
            if(ctx.onCustomSocket)ctx.onCustomSocket(msg);
            return 'custom_socket';
        }
        case MAIN_OPCODE.CONNECT: { // 0xF1
            if (subcode === F1_SUBCODE.JOIN_SERVER) {
                // PMSG_CONNECT_CLIENT_RECV / RecvJoinServerNew. Gateway BOTH id=2
                // preserves the GS result, client index and 5-byte version.
                if (!need(8, 'joinServer')) return 'payload_short';
                const result = payload[0];
                const index = (payload[1] << 8) | payload[2];
                const version = new TextDecoder().decode(payload.subarray(3, 8)).replace(/\0.*$/s, '');
                const caps = payload.length > 8
                    ? new TextDecoder().decode(payload.subarray(8)).replace(/\0.*$/s, '')
                    : '';
                if (ctx.onJoinServer) ctx.onJoinServer({ result, index, version, caps });
                return 'join_server';
            }
            if (subcode === F1_SUBCODE.LOGIN) {
                if (!need(1, 'loginResult')) return 'payload_short';
                if (payload.length !== 1) return 'payload_short';
                const code = payload[0];
                if (ctx.onLoginResult) ctx.onLoginResult(code);
                return 'login_result';
            }
            if (subcode === F1_SUBCODE.LOGOUT) {
                if (ctx.onLogout) ctx.onLogout();
                return 'logout';
            }
            log(`[MU] F1 sub desconhecido: 0x${subcode?.toString(16)} (${opcodeName})`, 'info');
            return 'f1_unknown';
        }

        case MAIN_OPCODE.SERVER_LIST: { // 0xF4 — ConnectServer (ReceiveServerList WSclient.cpp:310 / ReceiveServerConnect:344)
            if (subcode === F4_SUBCODE.SERVER_LIST) {
                // C2 [szH szL] F4 06 [countH countL] N×{WORD codeLE, BYTE percent, BYTE type}
                // WIRE PROVADO 2026-09-27: C2 00 0B F4 06 00 01 01 00 00 CC
                // => count=1, serverCode=1. O count vem em ordem de rede (BE), embora
                // ServerCode e F4:03 port sejam WORD little-endian no mesmo protocolo.
                // payload começa APÓS o subcode (payloadStart 5 p/ C2): [countH countL] entries…
                if (!need(2, 'serverList')) return 'payload_short';
                const raw = packet.type === 0xC1 || packet.type === 0xC3
                    ? { countAt: 0, entryAt: 2 }   // C1: payload=[countL,countH,...] — entry 4 bytes
                    : { countAt: 0, entryAt: 2 };
                // payload já exclui type/size/head/sub (C2: payloadStart=5) →
                // payload[0..1]=count BE, payload[2..]=entries de 4 bytes.
                // NÃO trocar por LE: no wire real [00 01] significa 1, não 256.
                const count = (payload[raw.countAt] << 8) | payload[raw.countAt + 1];
                // R15.7 authority: server-list snapshot is atomic. Never publish a
                // declared count with only a prefix of entries; that can select a
                // wrong serverCode during CS->GS handoff.
                const required = raw.entryAt + count * 4;
                if (payload.length !== required) {
                    log(`[MU] F4:06 serverList truncada/tamanho inválido (${payload.length}/${required}, count=${count})`, 'warn');
                    return 'payload_short';
                }
                const entries = [];
                for (let i = 0; i < count; i++) {
                    const off = raw.entryAt + 4 * i;
                    entries.push({
                        serverCode: payload[off] | (payload[off + 1] << 8),
                        percent: payload[off + 2],
                    });
                }
                if (ctx.onServerList) ctx.onServerList({ total: count, entries });
                return 'server_list';
            }
            if (subcode === F4_SUBCODE.SERVER_CONNECT) {
                // C1 F4 03 [IP 16] [WORD port] — ReceiveServerConnect (WSclient.cpp:344)
                if (!need(18, 'serverAddress')) return 'payload_short';
                if (payload.length !== 18) return 'payload_short';
                let ip = '';
                for (let i = 0; i < 16; i++) {
                    if (payload[i] === 0) break;
                    ip += String.fromCharCode(payload[i]);
                }
                const port = payload[16] | (payload[17] << 8);
                if (ctx.onServerAddress) ctx.onServerAddress({ ip, port });
                return 'server_address';
            }
            // Anti-flood consistente com F3/default (mesmo Set): 1 log por
            // subcode F4 por sessão — o F4 não tem handlers além de 03/06 no
            // fluxo normal, mas subs custom do GS não devem inundar o console.
            {
                const key = `f4:${subcode}`;
                if (!_loggedUnknownPackets.has(key)) {
                    _loggedUnknownPackets.add(key);
                    log(`[MU] F4 sub não roteado: 0x${subcode?.toString(16)} — log único`, 'info');
                }
            }
            return 'f4_unknown';
        }

        case MAIN_OPCODE.CHARACTER: { // 0xF3 — GameServer (WSclient.h: CHARACTER)
            if (subcode === 0x70) {
                // F3:70 has two proven shapes in the retained custom lineage:
                //   A) short CHARACTER_LIST_NEWS helper immediately before F3:00;
                //   B) custom preview rows keyed by CHARACTER NAME.
                // Distinguish by exact byte law instead of hard-wiring the opcode
                // to only shape A. This fixes SelectChar custom mounts/wings being
                // silently discarded while preserving the existing short packet.
                if (!need(1, 'charListNews')) return 'payload_short';
                const count = payload[0] || 0;
                const customLen = 2 + count * 24;
                if (payload.length === customLen) {
                    const rd16 = (o) => payload[o] | (payload[o + 1] << 8);
                    const decoder = new TextDecoder('ascii');
                    const records = [];
                    for (let i = 0; i < count; i++) {
                        const at = 2 + i * 24;
                        const rawName = payload.subarray(at, at + 11);
                        const nul = rawName.indexOf(0);
                        const name = decoder.decode(nul >= 0 ? rawName.subarray(0, nul) : rawName);
                        records.push({
                            name, petIndex: rd16(at + 12), secondPetIndex: rd16(at + 14),
                            wingIndex: rd16(at + 16), key: rd16(at + 18) & 0x7FFF,
                            element: [rd16(at + 20), rd16(at + 22)],
                        });
                    }
                    const msg = { count, viewport: payload[1] !== 0, records, opcode: 0x70 };
                    if (ctx.onCustomPreview) ctx.onCustomPreview(msg);
                    return 'custom_preview_70';
                }
                if (ctx.onCharacterListNews) ctx.onCharacterListNews({ count, payload });
                return 'character_news';
            }
            if (subcode === 0x00) {
                // R12.4 — parser adaptativo baseado nos contratos PC + GS Android.
                // PC legado:       hdr payload=4 bytes, entry nativo=34 (padding após Name[10]).
                // GS Android >=602: hdr payload=5 bytes (ExtWarehouse), entry wire=33 explícito.
                // Algumas builds/configs podem reportar MaxCharacter=0 mesmo com chars válidos;
                // nesse caso NÃO inventamos chars: derivamos apenas a capacidade visual mínima
                // (5, constante da cena PC) depois de validar rigorosamente os entries reais.
                if (!need(4, 'charList')) return 'payload_short';

                const rawHex = () => Array.from(packet.raw || []).slice(0, 96)
                    .map((b) => b.toString(16).padStart(2, '0')).join(' ');
                const candidates = [];
                const decoder = new TextDecoder('ascii');

                const parseCandidate = (shift, headerSize, entrySize) => {
                    if (shift + 4 > payload.length) return null;
                    const count = payload[shift + 2];
                    if (count > 10) return null;
                    const extLayout = headerSize === 5;
                    const wireMax = payload[shift + (extLayout ? 4 : 3)];
                    const extWarehouse = extLayout ? payload[shift + 3] : null;
                    const required = shift + headerSize + count * entrySize;
                    if (required !== payload.length) return null;

                    const chars = [];
                    const slots = new Set();
                    let score = 35;
                    if (shift === 0) score += 8;
                    if (wireMax >= 1 && wireMax <= 10) score += 20;
                    else if (wireMax === 0) score += 1;
                    else return null;
                    if (extLayout && extWarehouse <= 16) score += 3;

                    let off = shift + headerSize;
                    for (let i = 0; i < count; i++, off += entrySize) {
                        const slot = payload[off];
                        if (slot > 9 || slots.has(slot)) return null;
                        slots.add(slot);
                        const rawName = payload.subarray(off + 1, off + 11);
                        const nul = rawName.indexOf(0);
                        const nameBytes = nul >= 0 ? rawName.subarray(0, nul) : rawName;
                        const printable = nameBytes.length > 0 && Array.from(nameBytes).every((b) => b >= 0x20 && b <= 0x7E);
                        if (!printable) return null;
                        const name = decoder.decode(nameBytes);

                        // 33-byte Android = packed; 34-byte PC = 1 byte de padding antes do WORD Level.
                        const levelAt = entrySize === 34 ? off + 12 : off + 11;
                        const ctlAt = entrySize === 34 ? off + 14 : off + 13;
                        const charsetAt = entrySize === 34 ? off + 15 : off + 14;
                        const guildAt = entrySize === 34 ? off + 33 : off + 32;
                        if (guildAt >= payload.length) return null;
                        const level = payload[levelAt] | (payload[levelAt + 1] << 8);
                        // Níveis muito altos são possíveis em customs, portanto não invalidar;
                        // só pontuar o intervalo habitual para desempatar layouts deslocados.
                        score += 25;
                        if (level > 0 && level <= 2000) score += 8;
                        else if (level === 0) score += 2;
                        else score -= 5;
                        if (slot < 5) score += 2;

                        chars.push({
                            slot,
                            name,
                            level,
                            ctlCode: payload[ctlAt],
                            charset: Array.from(payload.subarray(charsetAt, charsetAt + 18)),
                            guildStatus: payload[guildAt],
                        });
                    }

                    const maxSlot = chars.reduce((m, c) => Math.max(m, c.slot), -1);
                    const maxDerived = wireMax === 0;
                    const maxCharacter = maxDerived
                        ? Math.min(10, Math.max(5, maxSlot + 1))
                        : wireMax;
                    if (chars.some((c) => c.slot >= maxCharacter)) return null;
                    return {
                        score, count, chars, maxCharacter, wireMaxCharacter: wireMax,
                        maxDerived, extWarehouse, shift, headerSize, entrySize,
                        layout: extLayout ? 'update>=602' : 'legacy',
                        wireLayout: `${extLayout ? 'update>=602' : 'legacy'}-${entrySize}b${shift ? `-shift${shift}` : ''}`,
                    };
                };

                // R46 integra a closure exata da lane R15.36 SEM apagar o wire
                // físico desta instalação. A captura Windows R45.2 do usuário passou
                // F3:00 como `legacy-33b` (header payload 4 + N*33), portanto esse
                // terceiro contrato é autoridade de runtime e deve permanecer.
                // Nenhum shift/cauda tolerante volta a ser aceito: o tamanho precisa
                // fechar exatamente em um dos três layouts comprovados.
                for (const [headerSize, entrySize] of [[5, 33], [4, 34], [4, 33]]) {
                    const c = parseCandidate(0, headerSize, entrySize);
                    if (c) candidates.push(c);
                }
                candidates.sort((a, b) => b.score - a.score);
                const best = candidates[0];
                if (!best) {
                    log(`[MU] F3:00 charList sem layout válido: bytes=${payload.length} raw=${rawHex()}`, 'warn');
                    return 'character_list_invalid';
                }

                if (best.maxDerived) {
                    log(`[MU] F3:00 MaxCharacter wire=0; capacidade visual derivada=${best.maxCharacter} após validar ${best.count} entry(s) reais (${best.wireLayout})`, 'warn');
                }
                log(`[MU] F3:00 charList OK count=${best.count} max=${best.maxCharacter} wireMax=${best.wireMaxCharacter} layout=${best.wireLayout}`, 'info');
                if (ctx.onCharacterList) ctx.onCharacterList(best);
                return 'character_list';
            }
            if (subcode === 0x02) {
                // C1 F3 02 CharacterDeleteResponse: exactly one result byte
                // after the subcode. Result: 0=unsuccessful, 1=successful,
                // 2=wrong security code. Do not infer a character locally;
                // the consumer re-requests F3:00 only after result=1.
                if (!need(1, 'charDelete')) return 'payload_short';
                if (payload.length !== 1) return 'payload_short';
                const result = payload[0];
                if (ctx.onCharacterDelete) ctx.onCharacterDelete({ result });
                return result === 1 ? 'character_delete_success' : 'character_delete_fail';
            }
            if (subcode === 0x01) {
                // C1 F3 01 [Result:1][Name:10][Slot:1][Level:2LE][Class:1]
                // PRECEIVE_CREATE_CHARACTER (WSclient.h:438-449) +
                // ReceiveCreateCharacter (WSclient.cpp:560): Result 1=success
                // (CreateHero no slot + UpdateDisplay), 0=fail, 2=fail2.
                if (!need(15, 'charCreate')) return 'payload_short';
                if (payload.length !== 15) return 'payload_short';
                const result = payload[0];
                const name = new TextDecoder().decode(payload.subarray(1, 11))
                    .replace(/\0.*$/s, '');
                const slot = payload[11];
                const level = payload[12] | (payload[13] << 8);
                const classByte = payload[14];
                if (ctx.onCharacterCreate) {
                    ctx.onCharacterCreate({ result, name, slot, level, classByte });
                }
                return result === 1 ? 'character_create_success' : 'character_create_fail';
            }
            if (subcode === 0x20) {
                // F3:20 ReceiveSummonLife — WSclient.cpp:6565-6569.
                // PHEADER_DEFAULT_SUBCODE = [PBMSG_HEADER][SubCode][Value], so
                // after the router strips F3:20 the payload is exactly one byte.
                if (!need(1, 'summonLife')) return 'payload_short';
                if (payload.length !== 1) return 'payload_short';
                const value = payload[0];
                if (ctx.onSummonLife) ctx.onSummonLife({ value });
                return 'summon_life';
            }
            if (subcode === 0x11) {
                // F3:11 ReceiveMagicList (WSclient.cpp:1179-1245).
                // Wire C1: [C1][size][F3][11][Value][ListType][entries ×4B]
                // Entry PRECEIVE_MAGIC_LIST (WSclient.h:892-899, pack(1)):
                //   [Index:1][Type:WORD LE][Level:1]
                // PC: Value=0xFF → Skill[Index]=0 (remove); 0xFE → seta UM; ListType=2
                //   → zera os listados; caso base (ListType=0 zera tudo antes) preenche
                //   Skill[Index]=Type. A rota entrega entries puras; reset fica no
                //   consumidor (ListType 0 → substituir a lista inteira).
                if (!need(2, 'magicList')) return 'payload_short';
                if ((payload.length - 2) % 4 !== 0) return 'payload_short';
                const listType = payload[1];
                const payloadValue = payload[0];
                const entries = [];
                for (let off = 2; off + 4 <= payload.length; off += 4) {
                    entries.push({
                        index: payload[off],
                        type: payload[off + 1] | (payload[off + 2] << 8),
                        level: payload[off + 3],
                    });
                }
                if (ctx.onMagicList) ctx.onMagicList({ value: payloadValue, listType, entries });
                return 'magic_list';
            }
            if (subcode === 0x03) {
                // F3:03 ReceiveJoinMapServer (WSclient.cpp:811-1016 handler,
                // struct PRECEIVE_JOIN_MAP_SERVER WSclient.h:470-514).
                // WIRE = CONTÍGUO (pack(1) do servidor). PROVA POR BYTES REAIS:
                // o frame PRECEIVE_NOTICE capturado no wire físico (probe BOTH,
                // teste wire-notice-weather 5/5) tem o texto 'Welcome MagoX !'
                // no offset absoluto 12 — exato layout contíguo
                // [Result@3][Count@4][Delay@5-6][Color@7-10][Speed@11][Notice@12];
                // com gap MSVC o texto estaria @13. O servidor casta structs
                // pack(1). NOTA DE CORREÇÃO: a inferência anterior de "default
                // MSVC via charlist-34b" estava ERRADA — 34B/entry é layout
                // custom do servidor MuPromax (byte extra vs o 33B pack(1) da
                // struct PC), não padding de alignment.
                // payload pos-sub = 98B contíguos:
                //   [0]PositionX [1]PositionY [2]Map [3]Angle
                //   [4..11]Exp (8B big-endian, PC L818-843)
                //   [12..19]NextExp (8B big-endian, PC L845-871)
                //   [20..71] 13×DWORD LE: LevelUpPoint,Strength,Dexterity,
                //     Vitality,Energy,Life,LifeMax,Mana,ManaMax,Shield,
                //     ShieldMax,SkillMana,SkillManaMax
                //   [72..75]Gold LE  [76]PK  [77]CtlCode  [78..79]PAD (gap MSVC)
                //   [80..83]AddPoint [84..87]MaxAddPoint [88..91]Charisma
                //   [92..95]wMinusPoint [96..99]wMaxMinusPoint (LE)
                // PROVA TRIPLA do gap: (1) sizeof struct = 104 (default MSVC,
                // pack(1) daria 102); (2) WIRE REAL (censo 999a): frame F3:03
                // capturado c3 68 f3 03 — size 0x68 = 104 = sizeof com gap;
                // (3) charlist físico 34B/entry (pack(1) daria 33).
                // NOTA: análise de correção anterior (contígua via PRECEIVE_
                // NOTICE) era ERRO ARITMÉTICO — sem o SubCode no offset; o
                // NOTICE não discrimina os alignments (Notice@13 nos dois).
                const SIZE = 100;
                if (!need(SIZE, 'joinMapServer')) return 'payload_short';
                if (payload.length !== SIZE) return 'payload_short';
                const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
                // Exp/nextExp: PC monta com |=byte e <<=8 → big-endian em 64 bits.
                const rd8BE = (o) => {
                    let v = 0n;
                    for (let k = 0; k < 8; k++) v = (v << 8n) | BigInt(payload[o + k]);
                    return v;
                };
                const msg = {
                    posX: payload[0], posY: payload[1], map: payload[2], angle: payload[3],
                    experience: rd8BE(4),
                    nextExperience: rd8BE(12),
                    levelUpPoint: dv.getUint32(20, true),
                    strength: dv.getUint32(24, true),
                    dexterity: dv.getUint32(28, true),
                    vitality: dv.getUint32(32, true),
                    energy: dv.getUint32(36, true),
                    life: dv.getUint32(40, true),
                    maxLife: dv.getUint32(44, true),
                    mana: dv.getUint32(48, true),
                    maxMana: dv.getUint32(52, true),
                    shield: dv.getUint32(56, true),
                    maxShield: dv.getUint32(60, true),
                    skillMana: dv.getUint32(64, true),
                    maxSkillMana: dv.getUint32(68, true),
                    gold: dv.getUint32(72, true),
                    pk: payload[76],
                    ctlCode: payload[77],
                    // pós-gap MSVC (@78-79): DWORDs reais começam @80
                    addPoint: dv.getUint32(80, true),
                    maxAddPoint: dv.getUint32(84, true),
                    charisma: dv.getUint32(88, true),
                    minusPoint: dv.getUint32(92, true),
                    maxMinusPoint: dv.getUint32(96, true),
                };
                if (ctx.onJoinMapServer) ctx.onJoinMapServer(msg);
                return 'join_map_server';
            }
            if (subcode === 0x10) {
                // F3:10 ReceiveInventory (WSclient.cpp:1279-1330+, struct
                // PRECEIVE_INVENTORY WSclient.h:542-545 + PACKET_ITEM_LENGTH=12 (L79)).
                // Wire C2: PWMSG_HEADER(4) + SubCode + Value(count) = 6B; depois
                // count × 13B entries [Index:1][Item:12]. Comentário PC "8byte" é
                // stale de versões antigas — autoridade é WSclient.h:544 com
                // PACKET_ITEM_LENGTH=12.
                if (!need(1, 'inventory')) return 'payload_short';
                const count = payload[0];
                if (payload.length !== 1 + count * 13) return 'payload_short';
                const items = [];
                const seenSlots = new Set();
                for (let i = 0; i < count; i++) {
                    const off = 1 + i * 13;
                    // A F3:10 is one atomic snapshot. A duplicate index would
                    // publish two items into one slot and is rejected before
                    // any inventory owner mutates.
                    if (seenSlots.has(payload[off])) return 'payload_invalid';
                    seenSlots.add(payload[off]);
                    items.push({
                        index: payload[off],
                        item: Array.from(payload.subarray(off + 1, off + 13)),
                    });
                }
                if (ctx.onInventory) ctx.onInventory({ count, items });
                return 'inventory';
            }
            if (subcode === 0x14) {
                // F3:14 ReceiveModifyItem: authoritative inventory slot update.
                // Audited same-base owner: body after F3/14 = [Index:1][ItemInfo:12].
                if (!need(1 + PACKET_ITEM_LENGTH, 'modifyItem')) return 'payload_short';
                if (payload.length !== 1 + PACKET_ITEM_LENGTH) {
                    log(`[MU] F3:14 modify-item tamanho inválido (${payload.length}/${1 + PACKET_ITEM_LENGTH})`, 'warn');
                    return 'payload_short';
                }
                const index = payload[0];
                const item = Uint8Array.from(payload.subarray(1, 1 + PACKET_ITEM_LENGTH));
                if (ctx.onInventoryModify) ctx.onInventoryModify({ index, item });
                return 'inventory_modify';
            }
            if (subcode === 0x13) {
                // F3:13 ReceiveEquipment — WSclient.cpp:1925-1930 (ReceiveEquipment),
                // struct PRECEIVE_EQUIPMENT WSclient.h:589-597
                // (cache Meshes, seams; EqList separado, $NÃO incluído nos 17);
                // payloadStart serial16: [KeyH][KeyL][Class][Equipment[17B]]
                // (EQUIPMENT_LENGTH = 17, _define.h L81). Consumidor: ChangeCharacterExt
                // na web (update attachments no CharSet] o caso-equipável 0x24
                // ReceiveEquipmentItem cobre esse update no spawn real-time).
                // UI: gravíssimo para chars equiparem / re-equiparem heroes.
                if (!need(20, 'equipment_snapshot')) return 'payload_short';
                if (payload.length !== 20) return 'payload_short';
                const key = (payload[0] << 8) | payload[1];
                const classByte = payload[2];
                const equipment = Array.from(payload.subarray(3, 3 + 17));
                if (ctx.onEquipment) ctx.onEquipment({ key, classByte, equipment });
                return 'equipment_snapshot';
            }
            if (subcode === 0x05) {
                // F3:05 ReceiveLevelUp (WSclient.cpp:13184 → ReceiveLevelUp;
                // struct PRECEIVE_LEVEL_UP WSclient.h:924-938).
                // WIRE = DEFAULT MSVC (gap): PROVA TRIPLA — (1) struct após o
                // pop pack(1)@L900 → default MSVC: Level WORD@4-5, LevelUpPoint
                // DWORD alinha 6→8 (GAP 2B @6-7), sizeof 44 (pack(1)=42);
                // (2) WIRE REAL F3:03 (mesma base/compilador, censo 999a):
                // frame c3 68 f3 03 size 0x68=104 = sizeof COM gap (102 sem);
                // (3) charlist físico 34B/entry (pack(1)=33). Correção de
                // correção: a "prova contígua" via PRECEIVE_NOTICE era erro
                // aritmético (SubCode faltando; Notice@13 nos DOIS alignments).
                // payload pós-sub = 40B:
                //   [0..1]Level LE [2..3]PAD (gap MSVC) [4..7]LevelUpPoint
                //   [8..11]MaxLife [12..15]MaxMana [16..19]MaxShield
                //   [20..23]SkillManaMax [24..27]AddPoint [28..31]MaxAddPoint
                //   [32..35]wMinusPoint [36..39]wMaxMinusPoint (LE)
                if (!need(40, 'levelUp')) return 'payload_short';
                if (payload.length !== 40) return 'payload_short';
                const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
                const rd32 = (o) => dv.getUint32(o, true);
                const msg = {
                    level: payload[0] | (payload[1] << 8),
                    // pós-gap: DWORDs reais começam @4
                    levelUpPoint: rd32(4),
                    maxLife: rd32(8),
                    maxMana: rd32(12),
                    maxShield: rd32(16),
                    maxSkillMana: rd32(20),
                    addPoint: rd32(24),
                    maxAddPoint: rd32(28),
                    minusPoint: rd32(32),
                    maxMinusPoint: rd32(36),
                };
                if (ctx.onLevelUp) ctx.onLevelUp(msg);
                return 'level_up';
            }
            if (subcode === 0x06) {
                // Exact current-client/mobile PcParseLevelUpPoint. Body excludes
                // F3/06. Result 16..20 selects STR/DEX/VIT/ENE/LEAD. Legacy
                // variants are 16B; extended variants are 56B and carry the
                // complete authoritative point/stat/resource snapshot.
                if (!need(16, 'addPointResult')) return 'payload_short';
                const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
                const u32 = (o) => dv.getUint32(o, true);
                const result = payload[0];
                const accepted = result >= 16 && result <= 20;
                const msg = { result, accepted, type: accepted ? result - 16 : -1, extended: payload.length >= 56 };
                if (accepted) {
                    if (payload.length >= 56) {
                        msg.points = u32(16);
                        msg.maxLife = u32(20); msg.maxMana = u32(24);
                        msg.maxBp = u32(28); msg.maxShield = u32(32);
                        msg.strength = u32(36); msg.dexterity = u32(40);
                        msg.vitality = u32(44); msg.energy = u32(48); msg.leadership = u32(52);
                    } else {
                        // Legacy PcParseLevelUpPoint only uses body+4 for the
                        // stat-specific max resource and always carries SD/BP.
                        msg.statMax = u32(4); msg.maxShield = u32(8); msg.maxBp = u32(12);
                    }
                }
                if (ctx.onAddPointResult) ctx.onAddPointResult(msg);
                return 'add_point_result';
            }
            if (subcode === 0x30) {
                // Evidence same-protocol mobile/PC parity owner PcParseOptionF330:
                // exactly 30B; 10 skill hotkeys are wire H/L, then option/QWE/chat/R,
                // qwerLevel is LE DWORD. Reject variants instead of guessing.
                if (!payload || payload.length !== 30) {
                    log(`[MU] F3:30 ReceiveOption tamanho inválido ${payload?.length ?? 0}/30 — descartado`, 'warn');
                    return 'payload_short';
                }
                const skillHotKey = [];
                for (let i = 0; i < 10; i++) skillHotKey.push((payload[i * 2] << 8) | payload[i * 2 + 1]);
                const qwerLevel = (payload[26] | (payload[27] << 8) | (payload[28] << 16) | (payload[29] << 24)) >>> 0;
                const msg = { skillHotKey, gameOption: payload[20], keyQWE: [payload[21], payload[22], payload[23]], chatLogBox: payload[24], keyR: payload[25], qwerLevel };
                if (ctx.onOption) ctx.onOption(msg);
                return 'option';
            }
            if (subcode === 0x50) {
                // F3:50 PMSG_MASTERLEVEL_INFO, exact body excluding subcode:
                // WORD level LE, QWORD exp BE, QWORD nextExp BE, WORD points LE,
                // WORD maxLife/maxMana/maxShield/maxBP LE. Same-lineage parser
                // PcParseMasterLevelInfoF350 proves 28 bytes; variants fail closed.
                if (!payload || payload.length !== 28) {
                    log(`[MU] F3:50 MasterLevelInfo tamanho inválido ${payload?.length ?? 0}/28 — descartado`, 'warn');
                    return 'payload_short';
                }
                const rd16 = (o) => payload[o] | (payload[o + 1] << 8);
                const rdBE64 = (o) => {
                    let v = 0n;
                    for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(payload[o + i]);
                    return v;
                };
                const msg = {
                    masterLevel: rd16(0),
                    masterExperience: rdBE64(2),
                    nextMasterExperience: rdBE64(10),
                    masterPoints: rd16(18),
                    masterMaxLife: rd16(20),
                    masterMaxMana: rd16(22),
                    masterMaxShield: rd16(24),
                    masterMaxBp: rd16(26),
                };
                if (ctx.onMasterLevelInfo) ctx.onMasterLevelInfo(msg);
                return 'master_level_info';
            }
            if (subcode === 0xE0) {
                // Exact current-client/mobile PcParseNewCharacterInfo. Body is
                // after F3/E0. WORD Level is naturally aligned, so the first
                // DWORD begins at +4. Base view is 84B; GAMESERVER_EXTRA==0
                // appends the authoritative full-width View* block through 144B.
                if (!need(84, 'newCharacterInfo')) return 'payload_short';
                const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
                const u32 = (o) => dv.getUint32(o, true);
                const msg = {
                    level: dv.getUint16(0, true),
                    points: u32(4),
                    experienceLow: u32(8), nextExperienceLow: u32(12),
                    strength: u32(16), dexterity: u32(20), vitality: u32(24), energy: u32(28), leadership: u32(32),
                    life: u32(36), maxLife: u32(40), mana: u32(44), maxMana: u32(48),
                    bp: u32(52), maxBp: u32(56), shield: u32(60), maxShield: u32(64),
                    fruitAdd: u32(68), maxFruitAdd: u32(72), fruitSub: u32(76), maxFruitSub: u32(80),
                    resetValid: false,
                };
                if (payload.length >= 144) {
                    msg.reset = u32(84); msg.resetValid = true;
                    msg.points = u32(88);
                    msg.life = u32(92); msg.maxLife = u32(96);
                    msg.mana = u32(100); msg.maxMana = u32(104);
                    msg.bp = u32(108); msg.maxBp = u32(112);
                    msg.shield = u32(116); msg.maxShield = u32(120);
                    msg.strength = u32(124); msg.dexterity = u32(128); msg.vitality = u32(132); msg.energy = u32(136); msg.leadership = u32(140);
                }
                if (ctx.onNewCharacterInfo) ctx.onNewCharacterInfo(msg);
                return 'new_character_info';
            }
            if (subcode === 0xE1) {
                // Exact current-client/mobile PcParseCharacterCalculation.
                // Short 76B variants own resources/bonus stats/damage; longer
                // variants append multipliers, speeds, PvP, defense and DL pet.
                if (!need(76, 'characterCalculation')) return 'payload_short';
                const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
                const u32 = (o) => dv.getUint32(o, true);
                const msg = {
                    life:u32(0), maxLife:u32(4), mana:u32(8), maxMana:u32(12),
                    bp:u32(16), maxBp:u32(20), shield:u32(24), maxShield:u32(28),
                    addStrength:u32(32), addDexterity:u32(36), addVitality:u32(40), addEnergy:u32(44), addLeadership:u32(48),
                    physicalMin:u32(52), physicalMax:u32(56), magicMin:u32(60), magicMax:u32(64),
                    curseMin:u32(68), curseMax:u32(72), calculationValid:true,
                    calculationFields: {
                        damage: true, magic: true, curse: true,
                        multipliers: false, rates: false, speed: false,
                        attackSuccess: false, defense: false, defensePvp: false,
                        rfMultipliers: false, darkSpirit: false,
                    },
                };
                if (payload.length >= 84) { msg.mulPhysical=u32(76); msg.divPhysical=u32(80); msg.calculationFields.multipliers=true; }
                if (payload.length >= 92) { msg.mulMagic=u32(84); msg.divMagic=u32(88); msg.calculationFields.multipliers=true; }
                if (payload.length >= 100) { msg.mulCurse=u32(92); msg.divCurse=u32(96); msg.calculationFields.multipliers=true; }
                if (payload.length >= 108) { msg.magicDamageRate=u32(100); msg.curseDamageRate=u32(104); msg.calculationFields.rates=true; }
                if (payload.length >= 116) { msg.physicalSpeed=u32(108); msg.magicSpeed=u32(112); msg.calculationFields.speed=true; }
                if (payload.length >= 124) { msg.attackSuccess=u32(116); msg.attackSuccessPvp=u32(120); msg.calculationFields.attackSuccess=true; }
                if (payload.length >= 132) { msg.defense=u32(124); msg.defenseSuccess=u32(128); msg.calculationFields.defense=true; }
                if (payload.length >= 136) { msg.defenseSuccessPvp=u32(132); msg.calculationFields.defensePvp=true; }
                if (payload.length >= 152) { msg.damageMultiplier=u32(136); msg.rfMultiplierA=u32(140); msg.rfMultiplierB=u32(144); msg.rfMultiplierC=u32(148); msg.calculationFields.rfMultipliers=true; }
                if (payload.length >= 168) { msg.darkSpiritMin=u32(152); msg.darkSpiritMax=u32(156); msg.darkSpiritSpeed=u32(160); msg.darkSpiritSuccess=u32(164); msg.calculationFields.darkSpirit=true; }
                if (ctx.onCharacterCalculation) ctx.onCharacterCalculation(msg);
                return 'character_calculation';
            }
            if (subcode === 0x72) {
                // F3:72 PMSG_VIEWPORT_PLAYER_NEWS custom-preview baseline.
                // [count][viewport] + N*24; record has one explicit pad byte
                // after name[11], then native LE WORDs. Never guess custom BMDs.
                if (!need(2, 'customPreviewHeader')) return 'payload_short';
                const count = payload[0];
                const required = 2 + count * 24;
                if (payload.length !== required) {
                    log(`[MU] F3:72 CustomPreview layout inválido count=${count} bytes=${payload.length}/${required} — descartado`, 'warn');
                    return 'payload_short';
                }
                const rd16 = (o) => payload[o] | (payload[o + 1] << 8);
                const decoder = new TextDecoder('ascii');
                const records = [];
                for (let i = 0; i < count; i++) {
                    const at = 2 + i * 24;
                    const rawName = payload.subarray(at, at + 11);
                    const nul = rawName.indexOf(0);
                    const name = decoder.decode(nul >= 0 ? rawName.subarray(0, nul) : rawName);
                    records.push({
                        name,
                        petIndex: rd16(at + 12),
                        secondPetIndex: rd16(at + 14),
                        wingIndex: rd16(at + 16),
                        key: rd16(at + 18) & 0x7FFF,
                        element: [rd16(at + 20), rd16(at + 22)],
                    });
                }
                const msg = { count, viewport: payload[1] !== 0, records };
                if (ctx.onCustomPreview) ctx.onCustomPreview(msg);
                return 'custom_preview';
            }
            if (subcode === 0x40) {
                // PcParseServerCommandF340 current same-protocol contract: exactly 3B.
                if (!payload || payload.length !== 3) {
                    log(`[MU] F3:40 ServerCommand tamanho inválido ${payload?.length ?? 0}/3 — descartado`, 'warn');
                    return 'payload_short';
                }
                const msg = { cmd1: payload[0], cmd2: payload[1], cmd3: payload[2] };
                if (ctx.onServerCommand) ctx.onServerCommand(msg);
                return 'server_command';
            }
            if (subcode === 0xE9) {
                // GCPatentePlayerRecv: count + N records. Current same-protocol
                // evidence accepts ONLY exact 12B (native padded) or 7B packed records.
                if (!need(1, 'patentHeader')) return 'payload_short';
                const count = payload[0];
                const remain = payload.length - 1;
                let stride = 0;
                if (count === 0) { if (payload.length !== 1) return 'payload_short'; }
                else if (remain === count * 12) stride = 12;
                else if (remain === count * 7) stride = 7;
                else { log(`[MU] F3:E9 Patent layout inválido count=${count} bytes=${remain} — descartado`, 'warn'); return 'payload_short'; }
                const records = [];
                for (let i = 0; i < count; i++) {
                    const at = 1 + i * stride;
                    const key = (((payload[at] << 8) | payload[at + 1]) & 0x7FFF);
                    const q = stride === 12 ? at + 4 : at + 2;
                    const patent = (payload[q] | (payload[q + 1] << 8) | (payload[q + 2] << 16) | (payload[q + 3] << 24)) >>> 0;
                    records.push({ key, patent, type: payload[q + 4] });
                }
                if (ctx.onPatent) ctx.onPatent({ count, stride, records });
                return 'patent';
            }
            if (subcode === 0x08) {
                // F3:08 ReceivePK — WSclient.h PRECEIVE_PK:
                // Header + SubCode + KeyH + KeyL + PK. Router payload excludes
                // header/head/sub, so the exact body is 3 bytes.
                if (!need(3, 'pk')) return 'payload_short';
                if (payload.length !== 3) return 'payload_short';
                const msg = { key: (payload[0] << 8) | payload[1], pk: payload[2] };
                if (ctx.onPkChange) ctx.onPkChange(msg);
                return 'pk';
            }
            if (subcode === 0x07) {
                // F3:07 ReceiveDamage (WSclient.cpp:13190 → ReceiveDamage;
                // struct PRECEIVE_DAMAGE WSclient.h:1022-1030):
                // pós-sub: [DamageH][DamageL][ShieldDamageH][ShieldDamageL] = 4B.
                // É o dano SOFRIDO pelo herói (monstro acertou) — feedback HUD.
                if (!need(4, 'damage')) return 'payload_short';
                const msg = {
                    damage: (payload[0] << 8) | payload[1],
                    shieldDamage: (payload[2] << 8) | payload[3],
                };
                if (ctx.onDamageTaken) ctx.onDamageTaken(msg);
                return 'damage_taken';
            }
            // Nomear subs conhecidos e logar UMA vez por subcode (PC fallthrough é
            // silencioso; o flood por-packet tornava o console ilegível — bug de
            // operação R12.4 reportado no console físico).
            {
                const key = `f3:${subcode}`;
                if (!_loggedUnknownPackets.has(key)) {
                    _loggedUnknownPackets.add(key);
                    const knownName = F3_KNOWN_PC[subcode];
                    log(`[MU] F3 ${subcode === 0xE2 ? '0xe2' : `0x${subcode?.toString(16)}`} ${knownName ? `(PC: ${knownName}, parser pendente — payload bruto disponível)` : '(sem handler no PC Main 5.2 — ignora igual ao PC default)'} — log único`, 'info');
                }
                return 'f3_unhandled';
            }
        }

        case MAIN_OPCODE.CHECKSUM_REQUEST: // 0x03 — keepalive
            return 'keepalive';

        case MAIN_OPCODE.LIFE: { // 0x26 — ReceiveLife (WSclient.cpp)
            // PRECEIVE_LIFE {PBMSG_HEADER; BYTE Index; DWORD life; DWORD shield}
            // (C1: payload após [head][sub]... na verdade C1 0C 26: [C1][sz][26]
            // [Index][life:4][shield:4] — payload = [Index][life:4][shield:4])
            // Index 0xFF: Life=life, Shield=shield (atuais) | 0xFE: máximos
            // (Master_Level_Data.wMaxLife no PC). Comprovado no wire real pós
            // select (MagoX): C1 0C 26 FF E7 E0 01 ... / C1 0C 26 FE E7 E0 01 ...
            if (!need(9, 'life')) return 'payload_short';
            if (payload.length !== 9) return 'payload_short';
            const index = payload[0];
            const life = (payload[1] | (payload[2] << 8) | (payload[3] << 16) | (payload[4] << 24)) >>> 0;
            const shield = (payload[5] | (payload[6] << 8) | (payload[7] << 16) | (payload[8] << 24)) >>> 0;
            if (ctx.onLife) ctx.onLife({ index, life, shield });
            return index === 0xFF ? 'life_current' : index === 0xFE ? 'life_max' : 'life_other';
        }

        case 0x27: { // ReceiveMana (WSclient.cpp: case 0x27 logo após LIFE)
            // PRECEIVE_MANA {PBMSG_HEADER; BYTE Index; DWORD mana; DWORD bp}
            // Index FF: mana/bp atuais | FE: máximos. Wire real (MagoX Lv350):
            // C1 0C 27 FF 3D A0 00 00 7E D3 00 00 → mana=41277, bp=54174.
            if (!need(9, 'mana')) return 'payload_short';
            if (payload.length !== 9) return 'payload_short';
            const index = payload[0];
            const mana = (payload[1] | (payload[2] << 8) | (payload[3] << 16) | (payload[4] << 24)) >>> 0;
            const bp = (payload[5] | (payload[6] << 8) | (payload[7] << 16) | (payload[8] << 24)) >>> 0;
            if (ctx.onMana) ctx.onMana({ index, mana, bp });
            return index === 0xFF ? 'mana_current' : index === 0xFE ? 'mana_max' : 'mana_other';
        }

        case 0x2D: { // ReceiveBuffState (WSclient.cpp:263711) — buffs do char
            // Emissor GS: GCPeriodicEffectSend (EffectManager.cpp:1763):
            // PMSG_PERIODIC_EFFECT_SEND {group:WORD, value:WORD, state:BYTE,
            // time:DWORD, effect:BYTE} + GCEffectStateSend (state==0→1).
            // Cliente PC: RegisterBuff/UnRegisterBuff no Hero (eBuffState).
            if (!need(10, 'buffState')) return 'payload_short';
            if (payload.length !== 10) return 'payload_short';
            const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            const raw = Array.from(payload);
            if (ctx.onBuffState) ctx.onBuffState({
                group: dv.getUint16(0, true), value: dv.getUint16(2, true),
                state: payload[4], time: dv.getUint32(5, true), effect: payload[9], raw,
            });
            return 'buff_state';
        }

        case 0xDE: { // Character Card — ReceiveCharacterCard_New (WSclient.cpp)
            // PHEADER_CHARACTERCARD {PBMSG_HEADER; Flag; CharacterCard}
            // bit0 Summoner, bit1 DarkLord, bit2 Dark (classes habilitadas)
            if (!need(2, 'charCard')) return 'payload_short';
            if (payload.length !== 2) return 'payload_short';
            const characterCard = payload[1];
            const enable = {
                summoner: !!(characterCard & 0x01),
                darkLord: !!(characterCard & 0x02),
                dark: !!(characterCard & 0x04),
            };
            if (ctx.onCharacterCard) ctx.onCharacterCard({ characterCard, enable });
            return 'character_card';
        }

        case MAIN_OPCODE.CHAT: { // 0x00 — PC PCHATING (WSclient.h:566-570):
            // [ID:10 (MAX_ID_SIZE)][ChatText:90 (MAX_CHAT_SIZE)] — SEM campo len.
            if (payload.length < 11) {
                // PC WSclient.cpp:1450-1453: em LOG_IN_SCENE um 0x00 mínimo é o
                // gatilho do CS p/ o cliente pedir a server list — NÃO é chat.
                log('[MU] 0x00 mínimo (handshake CS → RequestServerList no PC) — ignorado com segurança.', 'info');
                return 'serverlist_hint';
            }
            const rawId = payload.subarray(0, 10);
            const idEnd = rawId.indexOf(0);
            const id = new TextDecoder().decode(idEnd >= 0 ? rawId.subarray(0, idEnd) : rawId);
            let rawText = payload.subarray(10, Math.min(payload.length, 100)); // 10+MAX_CHAT_SIZE(90)
            let kind = 'normal';
            const ch0 = rawText[0];
            if (ch0 === 0x7E /* ~ */) { rawText = rawText.subarray(1); kind = 'party'; }
            else if (ch0 === 0x40 /* @ */) {
                if (rawText[1] === 0x40) { rawText = rawText.subarray(2); kind = 'union'; }
                else { rawText = rawText.subarray(1); kind = 'guild'; }
            }
            else if (ch0 === 0x24 /* $ */) { rawText = rawText.subarray(2); kind = 'gens'; }
            else if (ch0 === 0x23 /* # */) { rawText = rawText.subarray(1); kind = 'gm'; }
            const tEnd = rawText.indexOf(0);
            const msg = new TextDecoder().decode(tEnd >= 0 ? rawText.subarray(0, tEnd) : rawText);
            if (ctx.onChatDetailed) ctx.onChatDetailed({ id, msg, kind });
            else if (ctx.onChat) ctx.onChat(`${id}: ${msg}`);
            return 'chat';
        }

        case MAIN_OPCODE.WHISPER: { // 0x02 — ReceiveChatWhisper / PCHATING
            // Clean PC ReceiveChatWhisper casts the same PCHATING layout:
            // [ID:10][ChatText:MAX_CHAT_SIZE]. No invented length field.
            if (payload.length < 11) return 'payload_short';
            const rawId = payload.subarray(0, 10);
            const idEnd = rawId.indexOf(0);
            const id = new TextDecoder().decode(idEnd >= 0 ? rawId.subarray(0, idEnd) : rawId);
            const rawText = payload.subarray(10, Math.min(payload.length, 100));
            const tEnd = rawText.indexOf(0);
            const msg = new TextDecoder().decode(tEnd >= 0 ? rawText.subarray(0, tEnd) : rawText);
            if (ctx.onWhisper) ctx.onWhisper({ id, msg });
            else if (ctx.onChatDetailed) ctx.onChatDetailed({ id, msg, kind: 'whisper' });
            return 'whisper';
        }

        case MAIN_OPCODE.CREATE_PLAYER: { // 0x12 — ReceiveCreatePlayerViewport (WSclient.cpp:2231)
            // PWHEADER_DEFAULT_WORD: payload[0] = count (u8 no protocolo web).
            // Cada entry PCREATE_CHARACTER (WSclient.h:600-613):
            //   [KeyH][KeyL][PosX][PosY][Class][Equipment×17][ID×10]
            //   [TargetX][TargetY][Path][BuffCount][Buffs×16 no struct]
            // STRIDE VARIÁVEL — PC (WSclient.cpp:2440): Offset +=
            //   sizeof(PCREATE_CHARACTER) − (MAX_BUFF_SLOT_INDEX − BuffCount)
            //   = 52 − (16 − buffCount) = 36 + buffCount por entry.
            //   (MAX_ID_SIZE=10 _define.h:325, EQUIPMENT_LENGTH=17 WSclient.h:81,
            //    MAX_BUFF_SLOT_INDEX=16 _define.h:633, alignment 1).
            // PC (WSclient.cpp:2239-2241): Key = (KeyH<<8)+KeyL, bit15 =
            // CreateFlag, resto = key. Class = classe real do servidor.
            // PosX/Y = TILE 0-255 → mundo (tile+0.5)×100−12800.
            if (!need(1, 'playerViewport')) return 'payload_short';
            const count = payload[0];
            const players = [];
            let off = 1;
            // Fallback de layout (contexto: mesmo gateway que trouxe charList
            // "legacy-34b"): quando os bytes por entry NÃO fecham em 36, o
            // wrapper bridge reduz o entry a 35B sem Path/BuffCount (wire real
            // resposta do USUÁRIO: 'payload curto p/ playerViewportEntry (36/37)'
            // ocorria exatamente 1×/frame-solo). Detectar APÓS o parse estrito
            // falhar: se (len−1) % 35 === 0 e o fallback cobre todos count, parseia
            // a variante legacy. Sem este step, outros players jamais entravam
            // no viewport web (captura física 2026-09-25).
            const legacyLayout = ((payload.length - 1) % 35 === 0)
                && ((payload.length - 1) / 35 === count);
            const entryBase = legacyLayout ? 35 : 36;
            for (let i = 0; i < count; i++) {
                // R15.8: snapshot atomicity. `need()` expects a byte count, not
                // an absolute end offset; never break and publish a prefix.
                if (off + entryBase > payload.length) {
                    log(`[MU] 0x12 entry ${i} truncada (off=${off}, need=${entryBase}, len=${payload.length})`, 'warn');
                    return 'payload_short';
                }
                const keyRaw = (payload[off] << 8) + payload[off + 1];
                const id = new TextDecoder().decode(payload.subarray(off + 22, off + 32))
                    .replace(/\0.*$/s, '');
                // legacy: sem BuffCount — mas devolver o mesmo formato
                const buffCount = legacyLayout ? 0 : payload[off + 35];
                // PC MAX_BUFF_SLOT_INDEX=16. Values above this cannot be a valid
                // PCREATE_CHARACTER snapshot and must not shift the next entry.
                if (!legacyLayout && buffCount > 16) {
                    log(`[MU] 0x12 BuffCount inválido (entry ${i}, count=${buffCount}, max=16)`, 'warn');
                    return 'payload_short';
                }
                // R15.6 authority: viewport entries are atomic. A declared
                // BuffCount must be fully present before any actor state mutates.
                if (!legacyLayout && off + 36 + buffCount > payload.length) {
                    log(`[MU] 0x12 buffs truncados (entry ${i}, count=${buffCount}, off=${off}, len=${payload.length})`, 'warn');
                    return 'payload_short';
                }
                const buffs = legacyLayout
                    ? []
                    : Array.from(payload.subarray(off + 36, off + 36 + buffCount));
                players.push({
                    key: keyRaw & 0x7FFF,
                    createFlag: !!(keyRaw >> 15),
                    x: payload[off + 2],          // tile
                    y: payload[off + 3],          // tile
                    classByte: payload[off + 4],  // classe real servidor
                    equipment: Array.from(payload.subarray(off + 5, off + 22)),
                    id,
                    targetX: payload[off + 32],
                    targetY: payload[off + 33],
                    path: legacyLayout ? 0 : payload[off + 34], // ausente na legada
                    buffCount,
                    buffs,
                });
                off += legacyLayout ? 35 : (36 + buffCount);
            }
            // PC snapshot closes on the final variable-size entry. Reject an
            // unexplained tail instead of silently accepting an unknown layout.
            if (players.length !== count || off !== payload.length) {
                log(`[MU] 0x12 snapshot não fecha (parsed=${players.length}/${count}, off=${off}, len=${payload.length})`, 'warn');
                return 'payload_short';
            }
            if (ctx.onPlayerViewport) {
                ctx.onPlayerViewport({ count, players });
            }
            if (ctx.onViewportEnter) ctx.onViewportEnter(opcodeName, payload);
            return 'viewport_enter';
        }

        case MAIN_OPCODE.MOVE: { // 0xD4 — ReceiveMoveCharacter / PMOVE_CHARACTER
            // Clean PC WSclient.h: after PBMSG header => KeyH,KeyL,PositionX,
            // PositionY,Path[1]. Path[0].high is target facing. Exact payload=5B.
            if (!need(5, 'move')) return 'payload_short';
            if (payload.length !== 5) return 'payload_short';
            const key=(((payload[0]<<8)|payload[1])&0x7FFF);
            const msg={key,x:payload[2],y:payload[3],dir:(payload[4]>>4)&7,pathCount:(payload[4]&0x0F)+1};
            if(ctx.onMove)ctx.onMove(msg);
            return 'move';
        }

        case MAIN_OPCODE.POSITION: { // 0x15 — PRECEIVE_MOVE_POSITION
            // PC/Main evidence: payload pós-head = KeyH,KeyL,PositionX,PositionY.
            if (!need(4, 'position')) return 'payload_short';
            if (payload.length !== 4) return 'payload_short';
            const key = (((payload[0] << 8) | payload[1]) & 0x7FFF);
            const msg = { key, x: payload[2], y: payload[3] };
            if (ctx.onPosition) ctx.onPosition(msg);
            return 'position';
        }

        case MAIN_OPCODE.ATTACK: { // 0x11 — PRECEIVE_ATTACK / ReceiveAttackDamage
            // Evidence PC/mobile same-base: [KeyH][KeyL][DamageH][DamageL]
            // [DamageType][ShieldDamageH][ShieldDamageL]. Bit15 da key=Success.
            if (!need(7, 'attack')) return 'payload_short';
            if (payload.length !== 7) return 'payload_short';
            const wireKey = (payload[0] << 8) | payload[1];
            const msg = {
                key: wireKey & 0x7FFF, success: !!(wireKey & 0x8000),
                damage: (payload[2] << 8) | payload[3],
                damageType: payload[4],
                shieldDamage: (payload[5] << 8) | payload[6],
            };
            if (ctx.onAttack) ctx.onAttack(msg);
            return 'attack';
        }

        case MAIN_OPCODE.ACTION: { // 0x18 — PRECEIVE_ACTION
            // [KeyH][KeyL][Angle][Action][TargetKeyH][TargetKeyL].
            if (!need(6, 'action')) return 'payload_short';
            if (payload.length !== 6) return 'payload_short';
            const msg = {
                key: (((payload[0] << 8) | payload[1]) & 0x7FFF),
                angle: payload[2], action: payload[3],
                targetKey: (((payload[4] << 8) | payload[5]) & 0x7FFF),
            };
            if (ctx.onAction) ctx.onAction(msg);
            return 'action';
        }

        case MAIN_OPCODE.MAGIC: { // 0x19 — ReceiveMagic (WSclient.cpp:3824-4865)
            // PRECEIVE_MAGIC (WSclient.h:834-842):
            // [MagicH][MagicL][SourceKeyH][SourceKeyL][TargetKeyH][TargetKeyL].
            // Magic/keys são montados H<<8|L no PC; bit15 do TargetKey = Success.
            if (!need(6, 'magic')) return 'payload_short';
            if (payload.length !== 6) return 'payload_short';
            const magicNumber = (payload[0] << 8) | payload[1];
            const sourceKey = ((payload[2] << 8) | payload[3]) & 0x7FFF;
            const rawTargetKey = (payload[4] << 8) | payload[5];
            const success = (rawTargetKey & 0x8000) !== 0;
            const targetKey = rawTargetKey & 0x7FFF;
            if (ctx.onMagic) ctx.onMagic({ magicNumber, sourceKey, targetKey, success });
            return 'magic';
        }

        case MAIN_OPCODE.MAGIC_POSITION: { // 0x1A — ReceiveMagicPosition
            // PRECEIVE_MAGIC_POSITIONS (WSclient.h:870-882):
            // [SourceKeyH][SourceKeyL][MagicH][MagicL][X][Y][Count] + Count×[KeyH][KeyL].
            if (!need(7, 'magicPosition')) return 'payload_short';
            const sourceKey = ((payload[0] << 8) | payload[1]) & 0x7FFF;
            const magicNumber = (payload[2] << 8) | payload[3];
            const x = payload[4], y = payload[5], count = payload[6];
            if (payload.length !== 7 + count * 2) {
                log(`[MU] 0x1A magicPosition targets truncados (${payload.length}/${7 + count * 2})`, 'warn');
                return 'payload_short';
            }
            const targetKeys = [];
            for (let i = 0; i < count; i++) {
                const off = 7 + i * 2;
                targetKeys.push(((payload[off] << 8) | payload[off + 1]) & 0x7FFF);
            }
            if (ctx.onMagicPosition) ctx.onMagicPosition({ sourceKey, magicNumber, x, y, count, targetKeys });
            return 'magic_position';
        }

        case MAIN_OPCODE.MAGIC_CONTINUE: { // 0x1E — ReceiveMagicContinue
            // PRECEIVE_MAGIC_CONTINUE (WSclient.h:821-831):
            // [MagicH][MagicL][KeyH][KeyL][PositionX][PositionY][Angle].
            if (!need(7, 'magicContinue')) return 'payload_short';
            if (payload.length !== 7) return 'payload_short';
            const magicNumber = (payload[0] << 8) | payload[1];
            const sourceKey = ((payload[2] << 8) | payload[3]) & 0x7FFF;
            const x = payload[4], y = payload[5], angle = payload[6];
            if (ctx.onMagicContinue) ctx.onMagicContinue({ magicNumber, sourceKey, x, y, angle });
            return 'magic_continue';
        }

        case MAIN_OPCODE.MAGIC_FINISH: { // 0x1B — ReceiveMagicFinish
            // PHEADER_DEFAULT_VALUE_KEY (WSclient.h:238-244): [Value][KeyH][KeyL].
            if (!need(3, 'magicFinish')) return 'payload_short';
            if (payload.length !== 3) return 'payload_short';
            const magicNumber = payload[0];
            const targetKey = ((payload[1] << 8) | payload[2]) & 0x7FFF;
            if (ctx.onMagicFinish) ctx.onMagicFinish({ magicNumber, targetKey });
            return 'magic_finish';
        }

        case MAIN_OPCODE.TELEPORT: { // 0x1C — ReceiveTeleport (WSclient.cpp:13478→1759)
            // NOTA: NÃO confundir com 0x0F (ReceiveWeather, dispatcher L13300) —
            // o frame `c1 04 0f 00` do wire real é WEATHER, não teleport. O
            // PRECEIVE_TELEPORT_POSITION (WSclient.h:1013-1020) tem WORD Flag.
            // A Main 5.2 recebe o struct nativo; o GS real desta base emite o
            // layout MSVC alinhado (frame 10B => payload pós-head 7B):
            //   [pad][FlagLE:2][Map][X][Y][Angle].
            // Builds históricas também existem em forma packed de 9B total:
            //   [FlagLE:2][Map][X][Y][Angle].
            // Aceitamos SOMENTE 6 ou 7 bytes completos; qualquer outro tamanho
            // é fail-closed para não deslocar Map/X/Y silenciosamente.
            if (!payload || (payload.length !== 6 && payload.length !== 7)) return 'payload_short';
            const base = payload.length === 7 ? 1 : 0;
            const flag = payload[base] | (payload[base + 1] << 8);
            const teleport = {
                flag,
                map: payload[base + 2],
                x: payload[base + 3],          // tile
                y: payload[base + 4],          // tile
                angle: payload[base + 5],      // (a−1)×45° no PC
                wireLayout: base ? 'msvc-aligned' : 'packed',
            };
            if (ctx.onTeleport) ctx.onTeleport(teleport);
            return flag === 0 ? 'teleport_end' : 'teleport_map_change';
        }

        case MAIN_OPCODE.CREATE_MONSTER: { // 0x13 — ReceiveCreateMonsterViewport (WSclient.cpp:2665)
            // PWHEADER_DEFAULT_WORD: payload[0] = count. Cada entry PCREATE_MONSTER
            // (WSclient.h:650): [KeyH][KeyL][TypeH][TypeL][PosX][PosY][TargetX]
            // [TargetY][Path][BuffCount][Buffs×BuffCount] — stride 10+BuffCount
            // (MAX_BUFF_SLOT_INDEX=16, _define.h:633). Flags PC: Key bit15 =
            // CreateFlag (AppearMonster), KeyH bit6 = TeleportFlag, TypeH bit7 =
            // bMyMob, bits6-4 = byBuildTime; Type = ((TypeH&0x03)<<8)+TypeL (10b);
            // ângulo MU = ((Path>>4)−1)×45°.
            if (!need(1, 'monsterViewport')) return 'payload_short';
            const count = payload[0];
            const monsters = [];
            let off = 1;
            for (let i = 0; i < count; i++) {
                if (off + 10 > payload.length) {
                    log(`[MU] 0x13 entry ${i} truncada (off=${off}, len=${payload.length})`, 'warn');
                    return 'payload_short';
                }
                const keyH = payload[off], keyL = payload[off + 1];
                const typeH = payload[off + 2], typeL = payload[off + 3];
                const buffCount = payload[off + 9];
                if (buffCount > 16) {
                    log(`[MU] 0x13 BuffCount inválido (entry ${i}, count=${buffCount}, max=16)`, 'warn');
                    return 'payload_short';
                }
                if (off + 10 + buffCount > payload.length) {
                    log(`[MU] 0x13 buffs truncados (entry ${i})`, 'warn');
                    return 'payload_short';
                }
                const buffs = [];
                for (let b = 0; b < buffCount; b++) buffs.push(payload[off + 10 + b]);
                monsters.push({
                    key: ((keyH << 8) + keyL) & 0x7FFF,       // PC: Key &= 0x7FFF
                    createFlag: (keyH & 0x80) !== 0,           // PC: Key >> 15
                    teleportFlag: (keyH & 0x40) !== 0,         // PC: KeyH bit6
                    myMob: (typeH & 0x80) !== 0,                // PC: bMyMob
                    buildTime: (typeH & 0x70) >> 4,             // PC: byBuildTime
                    type: ((typeH & 0x03) << 8) + typeL,       // monsterClass real (Monster.txt)
                    x: payload[off + 4], y: payload[off + 5],  // tiles 0-255
                    targetX: payload[off + 6], targetY: payload[off + 7],
                    dir: payload[off + 8] >> 4,                 // ângulo = (dir−1)×45°
                    buffs,
                });
                off += 10 + buffCount;
            }
            if (monsters.length !== count || off !== payload.length) {
                log(`[MU] 0x13 snapshot não fecha (parsed=${monsters.length}/${count}, off=${off}, len=${payload.length})`, 'warn');
                return 'payload_short';
            }
            if (ctx.onMonsterViewport) ctx.onMonsterViewport({ count, monsters });
            return 'monster_viewport';
        }

        case MAIN_OPCODE.DELETE_VIEWPORT: { // 0x14 — ReceiveDeleteCharacterViewport (WSclient.cpp:2873)
            // PHEADER_DEFAULT: payload[0] = count; entries [KeyH][KeyL]
            // (bit15 = DeleteFlag; key = &0x7FFF).
            if (!need(1, 'viewportDelete')) return 'payload_short';
            const count = payload[0];
            const required = 1 + count * 2;
            if (payload.length < required) {
                log(`[MU] 0x14 viewportDelete truncado (${payload.length}/${required}, count=${count})`, 'warn');
                return 'payload_short';
            }
            if (payload.length !== required) {
                log(`[MU] 0x14 viewportDelete tamanho inesperado (${payload.length}/${required}, count=${count})`, 'warn');
                return 'payload_short';
            }
            const keys = [];
            for (let i = 0; i < count; i++) {
                const keyH = payload[1 + 2 * i], keyL = payload[2 + 2 * i];
                keys.push({ key: ((keyH << 8) + keyL) & 0x7FFF, deleteFlag: (keyH & 0x80) !== 0 });
            }
            if (ctx.onViewportDelete) ctx.onViewportDelete({ count, keys });
            return 'viewport_leave';
        }

        case MAIN_OPCODE.CREATE_ITEM: { // 0x20 — ReceiveCreateItemViewport (WSclient.cpp:5701)
            // PWHEADER_DEFAULT_WORD: [count:1] + count*PCREATE_ITEM.
            // PCREATE_ITEM (WSclient.h): [KeyH][KeyL][PositionX][PositionY][Item12] = 16B.
            if (!need(1, 'groundItemCreate')) return 'payload_short';
            const count = payload[0];
            const required = 1 + count * (4 + PACKET_ITEM_LENGTH);
            if (payload.length !== required) {
                log(`[MU] 0x20 world-item body inválido (${payload.length}/${required}, count=${count})`, 'warn');
                return 'payload_short';
            }
            const items = [];
            let off = 1;
            for (let i = 0; i < count; i++, off += 16) {
                const wireKey = ((payload[off] << 8) | payload[off + 1]) & 0xFFFF;
                const item = Uint8Array.from(payload.subarray(off + 4, off + 16));
                items.push({
                    wireKey,
                    key: wireKey & 0x7FFF,
                    createFlag: (wireKey & 0x8000) !== 0,
                    x: payload[off + 2],
                    y: payload[off + 3],
                    item,
                    itemType: decodePacketItemType(item),
                });
            }
            if (ctx.onGroundItemsCreate) ctx.onGroundItemsCreate({ count, items });
            return 'ground_items_create';
        }

        case MAIN_OPCODE.DELETE_ITEM: { // 0x21 — ReceiveDeleteItemViewport
            // PWHEADER_DEFAULT_WORD: [count:1] + count*PDELETE_CHARACTER(2B).
            if (!need(1, 'groundItemDelete')) return 'payload_short';
            const count = payload[0];
            const required = 1 + count * 2;
            if (payload.length !== required) {
                log(`[MU] 0x21 world-item delete inválido (${payload.length}/${required}, count=${count})`, 'warn');
                return 'payload_short';
            }
            const keys = [];
            for (let i = 0; i < count; i++) {
                const off = 1 + i * 2;
                keys.push(((payload[off] << 8) | payload[off + 1]) & 0xFFFF);
            }
            if (ctx.onGroundItemsDelete) ctx.onGroundItemsDelete({ count, keys });
            return 'ground_items_delete';
        }

        case MAIN_OPCODE.GET_ITEM: { // 0x22 — ReceiveGetItem / PRECEIVE_GET_ITEM
            // WSclient.h: [Result:1][Item:12] após o head. O sentinel 0xFE
            // carrega Zen autoritativo em Item[0..3] em network byte order.
            if (!need(1 + PACKET_ITEM_LENGTH, 'getItem')) return 'payload_short';
            if (payload.length !== 1 + PACKET_ITEM_LENGTH) {
                log(`[MU] 0x22 get-item tamanho inválido (${payload.length}/${1 + PACKET_ITEM_LENGTH})`, 'warn');
                return 'payload_short';
            }
            const result = payload[0];
            const item = Uint8Array.from(payload.subarray(1, 1 + PACKET_ITEM_LENGTH));
            let zen = null;
            if (result === 0xFE) {
                zen = (((item[0] << 24) >>> 0) | (item[1] << 16) | (item[2] << 8) | item[3]) >>> 0;
            }
            const msg = {
                result,
                item,
                itemType: result === 0xFF || result === 0xFE ? null : decodePacketItemType(item),
                zen,
                failed: result === 0xFF,
                multi: result === 0xFD,
                slot: (result !== 0xFF && result !== 0xFE && result !== 0xFD) ? result : null,
            };
            if (ctx.onGetItem) ctx.onGetItem(msg);
            return result === 0xFF ? 'get_item_reject' : 'get_item';
        }

        case MAIN_OPCODE.DROP_ITEM: { // 0x23 — supplied GS PMSG_ITEM_DROP_SEND
            if (!need(2, 'dropItem')) return 'payload_short';
            if (payload.length !== 2) {
                log(`[MU] 0x23 drop-item tamanho inválido (${payload.length}/2)`, 'warn');
                return 'payload_short';
            }
            const msg = { result: payload[0], slot: payload[1] };
            if (ctx.onDropItemResult) ctx.onDropItemResult(msg);
            return msg.result === 1 ? 'drop_item_success' : 'drop_item_reject';
        }

        case MAIN_OPCODE.DELETE_INVENTORY: { // 0x28 — authoritative inventory delete/use removal
            // Audited same-base owner: [Index:1][Flag:1]. Flag affects PC use-state,
            // not the fact that the inventory slot is removed.
            if (!need(2, 'deleteInventory')) return 'payload_short';
            if (payload.length !== 2) {
                log(`[MU] 0x28 delete-inventory tamanho inválido (${payload.length}/2)`, 'warn');
                return 'payload_short';
            }
            const msg = { index: payload[0], flag: payload[1] };
            if (ctx.onInventoryDelete) ctx.onInventoryDelete(msg);
            return 'inventory_delete';
        }

        case MAIN_OPCODE.TALK: { // 0x30 — ReceiveTalk, PHEADER_DEFAULT
            if (!need(1, 'talk')) return 'payload_short';
            if (payload.length !== 1) { log(`[MU] 0x30 talk tamanho inválido (${payload.length}/1)`, 'warn'); return 'payload_short'; }
            const msg = { value: payload[0] };
            if (ctx.onTalk) ctx.onTalk(msg);
            return 'talk';
        }

        case MAIN_OPCODE.TRADE_INVENTORY: { // 0x31 — ReceiveTradeInventory
            // PHEADER_DEFAULT_SUBCODE_WORD = Header3 + SubCode1 + Value WORD LE.
            // payload therefore starts [SubCode][CountLo][CountHi], followed by
            // Count × PRECEIVE_INVENTORY {Index:1, ItemInfo[12]}.
            if (!need(3, 'tradeInventory')) return 'payload_short';
            const count = payload[1] | (payload[2] << 8);
            const required = 3 + count * (1 + PACKET_ITEM_LENGTH);
            if (payload.length !== required) {
                log(`[MU] 0x31 trade-inventory tamanho inválido (${payload.length}/${required}, count=${count})`, 'warn');
                return 'payload_short';
            }
            const items=[]; let off=3;
            for(let i=0;i<count;i++) {
                const index=payload[off++];
                items.push({index,item:payload.slice(off,off+PACKET_ITEM_LENGTH)});
                off += PACKET_ITEM_LENGTH;
            }
            const msg={subCode:payload[0],count,items};
            if(ctx.onTradeInventory) ctx.onTradeInventory(msg);
            return 'trade_inventory';
        }

        case MAIN_OPCODE.BUY: { // 0x32 — ReceiveBuy / PHEADER_DEFAULT_ITEM
            if (!need(1 + PACKET_ITEM_LENGTH, 'buy')) return 'payload_short';
            if (payload.length !== 1 + PACKET_ITEM_LENGTH) {
                log(`[MU] 0x32 buy tamanho inválido (${payload.length}/${1+PACKET_ITEM_LENGTH})`, 'warn');
                return 'payload_short';
            }
            const msg={index:payload[0],item:payload.slice(1,1+PACKET_ITEM_LENGTH)};
            if(ctx.onBuy)ctx.onBuy(msg);
            return 'buy';
        }

        case MAIN_OPCODE.SELL: { // 0x33 — ReceiveSell / PRECEIVE_GOLD
            if (!need(5, 'sell')) return 'payload_short';
            if (payload.length !== 5) { log(`[MU] 0x33 sell tamanho inválido (${payload.length}/5)`, 'warn'); return 'payload_short'; }
            const gold=new DataView(payload.buffer,payload.byteOffset+1,4).getUint32(0,true);
            const msg={flag:payload[0],gold};
            if(ctx.onSell)ctx.onSell(msg);
            return 'sell';
        }

        case MAIN_OPCODE.REPAIR: { // 0x34 — ReceiveRepair / PRECEIVE_REPAIR_GOLD
            // MSVC packet layout: Header3 then one alignment byte then DWORD Gold.
            if (!need(5, 'repair')) return 'payload_short';
            if (payload.length !== 5) { log(`[MU] 0x34 repair tamanho inválido (${payload.length}/5)`, 'warn'); return 'payload_short'; }
            const gold=new DataView(payload.buffer,payload.byteOffset+1,4).getUint32(0,true);
            if(ctx.onRepair)ctx.onRepair({gold,pad:payload[0]});
            return 'repair';
        }

        case MAIN_OPCODE.STORAGE_GOLD: { // 0x81 — PRECEIVE_STORAGE_GOLD
            // [Result:1][StorageGold:DWORD LE][Gold:DWORD LE][CurrentWarehouse:DWORD LE][WarehouseCount:DWORD LE]
            if (!need(17, 'storageGold')) return 'payload_short';
            if (payload.length !== 17) { log(`[MU] 0x81 storage-gold tamanho inválido (${payload.length}/17)`, 'warn'); return 'payload_short'; }
            const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
            const msg = {
                result: payload[0] !== 0,
                storageGold: dv.getUint32(1, true),
                gold: dv.getUint32(5, true),
                currentWarehouse: dv.getUint32(9, true),
                warehouseCount: dv.getUint32(13, true),
            };
            if (ctx.onStorageGold) ctx.onStorageGold(msg);
            return 'storage_gold';
        }

        case MAIN_OPCODE.STORAGE_EXIT: { // 0x82 — ReceiveStorageExit (no payload owner)
            if (payload.length !== 0) { log(`[MU] 0x82 storage-exit tamanho inválido (${payload.length}/0)`, 'warn'); return 'payload_short'; }
            if (ctx.onStorageExit) ctx.onStorageExit();
            return 'storage_exit';
        }

        case MAIN_OPCODE.STORAGE_STATUS: { // 0x83 — PHEADER_DEFAULT
            if (!need(1, 'storageStatus')) return 'payload_short';
            if (payload.length !== 1) { log(`[MU] 0x83 storage-status tamanho inválido (${payload.length}/1)`, 'warn'); return 'payload_short'; }
            if (ctx.onStorageStatus) ctx.onStorageStatus({ value: payload[0] });
            return 'storage_status';
        }

        case MAIN_OPCODE.STORAGE_COST: { // 0x84 — WAREHOUSE_COST
            if (!need(40, 'storageCost')) return 'payload_short';
            if (payload.length !== 40) { log(`[MU] 0x84 storage-cost tamanho inválido (${payload.length}/40)`, 'warn'); return 'payload_short'; }
            const rawName = payload.subarray(0, 36);
            const nul = rawName.indexOf(0);
            const coinname = new TextDecoder().decode(nul >= 0 ? rawName.subarray(0, nul) : rawName);
            const value = new DataView(payload.buffer, payload.byteOffset + 36, 4).getUint32(0, true);
            if (ctx.onStorageCost) ctx.onStorageCost({ coinname, value });
            return 'storage_cost';
        }

        case MAIN_OPCODE.CHANGE_CHARACTER: { // 0x25 — PC ReceiveChangePlayer / PMSG_ITEM_CHANGE_SEND
            // Current EX603 authority: key[2] + ItemInfo[12] = 14-byte body.
            // Legacy >=701 lane may append ElementSlot as byte 15. Accept only
            // those two exact shapes; do not guess any other private layout.
            if (!need(14, 'changeCharacter')) return 'payload_short';
            if (payload.length !== 14 && payload.length !== 15) {
                log(`[MU] 0x25 change-character tamanho inválido (${payload.length}; esperado 14/15)`, 'warn');
                return 'payload_short';
            }
            const key = (((payload[0] << 8) | payload[1]) & 0x7FFF) >>> 0;
            const item = Array.from(payload.subarray(2, 2 + PACKET_ITEM_LENGTH));
            const itemType = decodePacketItemType(item);
            const slotCode = item[1] >>> 4;
            const encodedLevel = item[1] & 0x0F;
            const option = item[3] & 0x3F;
            const extOption = item[4];
            const hasElementSlot = payload.length === 15;
            const elementSlot = hasElementSlot ? payload[14] : 0;
            const msg = { key, item, itemType, slotCode, encodedLevel, option, extOption, elementSlot, hasElementSlot, wireBytes:payload.length };
            if (ctx.onChangeCharacter) ctx.onChangeCharacter(msg);
            return 'change_character';
        }

        case MAIN_OPCODE.EQUIPMENT_ITEM: { // 0x24 — ReceiveEquipmentItem (WSclient.cpp:5820, dispatcher L13342-13348)
            // PHEADER_DEFAULT_SUBCODE_ITEM (WSclient.h:307-312, pack natural):
            //   [PBMSG_HEADER:3][SubCode:1][Index:1][Item:PACKET_ITEM_LENGTH]
            //   PACKET_ITEM_LENGTH=12 (WSclient.h:79) → payload após head =
            //   [SubCode][Index][Item:12] = 14B mín.
            // Semântica PC (handler L5831-5900):
            //   SubCode 255 → RightClickDeleteItem(255) = cleanup picked-item
            //     (equip move cancelado; NÃO toca inventário)
            //   SubCode 0 → sucesso do equip-move: DeletePickedItem +
            //     Index<MAX_EQUIPMENT_INDEX → EquipItem(Index, Item) +
            //     NEW_EQUIPMENT_WEAPON_RIGHT..MAX_NEW → gVisualInventory +
            //     SetCharacterClass(Hero) (refresh visual do herói!);
            //     range inventário/storage/shop → InsertItem equivalente.
            //   SubCode 1 → trade (ProcessToReceiveTradeItems).
            // Fail-closed: o PC lê SubCode de qualquer tamanho (buffer 1024B
            // L5831-5838 checa 255 ANTES de Index/Item); web: 1B p/ subCode,
            // 255 → cancel imediato, senão 14B para Index+Item.
            if (!need(1, 'equipmentItem')) return 'payload_short';
            const subCode = payload[0];
            if (subCode === 255) {
                if (ctx.onEquipmentItemCancel) ctx.onEquipmentItemCancel();
                return 'equipment_item_cancel';
            }
            if (!need(14, 'equipmentItem')) return 'payload_short';
            if (payload.length !== 14) return 'payload_short';
            const index = payload[1];
            const item = Array.from(payload.subarray(2, 2 + PACKET_ITEM_LENGTH));
            if (ctx.onEquipmentItem) ctx.onEquipmentItem({ subCode, index, item });
            return subCode === 0 ? 'equipment_item' : 'equipment_item_sub';
        }

        case 0xD2: { // IGS family — WSclient.cpp dispatcher, PeriodItem sub 0x11/0x12
            // PMSG_PERIODITEMEX_ITEMCOUNT: PBMSG_HEADER2 + BYTE count.
            if (subcode === 0x11) {
                if (!need(1, 'periodItemCount') || payload.length !== 1) return 'payload_short';
                if (ctx.onPeriodItemCount) ctx.onPeriodItemCount(payload[0]);
                return 'period_item_count';
            }
            // PMSG_PERIODITEMEX_ITEMLIST: WORD itemCode, WORD itemSlotIndex,
            // long lExpireDate. Desktop x86 reads all fields little-endian.
            if (subcode === 0x12) {
                if (!need(8, 'periodItemList') || payload.length !== 8) return 'payload_short';
                const dv=new DataView(payload.buffer,payload.byteOffset,payload.byteLength);
                const msg={itemCode:dv.getUint16(0,true),slot:dv.getUint16(2,true),expireTime:dv.getInt32(4,true)};
                if (ctx.onPeriodItemExpire) ctx.onPeriodItemExpire(msg);
                return 'period_item_expire';
            }
            const key=`d2:${subcode}`;
            if(!_loggedUnknownPackets.has(key)){
                _loggedUnknownPackets.add(key);
                log(`[MU] headcode 0xD2 IGS sub não roteado: ${subcode==null?'sem-subcode':`0x${subcode.toString(16)}`} — log único`,'info');
            }
            if(ctx.onUnknown)ctx.onUnknown(packet);
            return 'unknown';
        }

        case 0x0D: { // ReceiveNotice — WSclient.cpp:1614 (dispatcher L13297)
            // PRECEIVE_NOTICE (WSclient.h:579-587): [Result:1][Count:1]
            // [Delay:2][Color:4][Speed:1][Notice:256] — texto null-term no
            // payload offset 9. PC: Result 0 → CreateNotice (banner);
            // 1 → chat system-message; 2 → guild notice; 10-15 → slide-help;
            // 25-100 → subclasses. Web: entrega o struct completo ao hook
            // (consumidor escolhe a apresentação; textos reais do servidor).
            if (!need(1, 'notice')) return 'payload_short';
            const result = payload[0];
            let text = '';
            if (payload.length > 9) {
                const td = new TextDecoder();
                const raw = payload.subarray(9);
                const end = raw.indexOf(0);
                text = td.decode(end >= 0 ? raw.subarray(0, end) : raw);
            }
            if (ctx.onNotice) {
                ctx.onNotice({
                    result,
                    count: payload[1] ?? 0,
                    delay: (payload[2] | (payload[3] << 8)) || 0,
                    color: ((payload[4] | (payload[5] << 8) | (payload[6] << 16) | (payload[7] << 24)) >>> 0) || 0,
                    speed: payload[8] ?? 0,
                    text,
                });
            }
            return 'notice';
        }

        case 0x0F: { // ReceiveWeather — WSclient.cpp dispatcher L13300
            // PRECEIVE_WEATHER (WSclient.h): {PBMSG_HEADER hdr; BYTE Weather}
            // — payload = 1 byte. Frame real do wire: 'c1 04 0f 00' (probe
            // BOTH 2026-09-25). 0x1C é TELEPORT — NÃO confundir com este.
            if (!need(1, 'weather')) return 'payload_short';
            if (payload.length !== 1) return 'payload_short';
            if (ctx.onWeather) ctx.onWeather(payload[0]);
            return 'weather';
        }

        default:
            // Exigência P0: desconhecido é LOGADO, nunca descartado em silêncio.
            // Anti-flood: loga UMA vez por headcode+subcode (ex.: BOTH_MESSAGE
            // sub=0xundefined que chega ~5x/s do gateway bridge). Nomeia subs
            // conhecidos do PC Main 5.2 (C1 result of switch — WSclient.cpp):
            const CLASSIC_PC_NAMES = {
                // 0x0F ReceiveWeather e 0x0D ReceiveNotice agora são cases
                // roteados acima — removidos daqui (não são 'desconhecidos').
                0xD2: 'ReceiveIGS_* (family sub)',
                0xBF: 'ReceiveCursedTempleEntryResult / ReceiveCursedTemplerResult',
                0xA0: 'ReceiveQuestHistory',
                0xC0: 'ReceiveFriendList',
                0xF6: 'ReceiveTimeLimitQuest (inativo)',
            };
            const unk = `head:${headcode?.toString(16)}:sub:${subcode ?? 'x'}`;
            if (!_loggedUnknownPackets.has(unk)) {
                _loggedUnknownPackets.add(unk);
                const name = CLASSIC_PC_NAMES[headcode] || `${opcodeName || 'head 0x' + headcode?.toString(16)}`;
                log(`[MU] Não roteado: ${name} (${headcode !== undefined ? '0x' + headcode.toString(16) : '?'})${subcode !== undefined && subcode !== null ? ` sub=0x${subcode.toString(16)}` : ''} size=${packet.size} — log único`, 'info');
            }
            if (ctx.onUnknown) ctx.onUnknown(packet);
            return 'unknown';
    }
}

/** Utilidade: código de login → boolean sucesso (LOGIN_RESULT da source) */
export function isLoginSuccess(code) {
    return code === LOGIN_RESULT.SUCCESS_1 || code === LOGIN_RESULT.SUCCESS_2;
}

export default routeMUPacket;
