/**
 * PacketTypes.js - Tipos de pacotes do protocolo MU Online
 * Port das constantes de protocolo do cliente C++ original.
 */

export const PacketTypes = {
    CHAT:           0x00,
    CHAR_LIST:      0x01,
    CHAR_SELECT:    0x02,
    MOVE:           0x03,
    ATTACK:         0x04,
    SKILL:          0x05,
    USE_ITEM:       0x06,
    DROP_ITEM:      0x07,
    TALK_NPC:       0x08,
    BUY_ITEM:       0x09,
    SELL_ITEM:      0x0A,
    ADD_STATS:      0x0B,
    WARP:           0x0C,
    TRADE_REQ:      0x10,
    PARTY_REQ:      0x11,
    LOGIN_REQ:      0x20,
    LOGIN_RES:      0x21,
    ENTER_WORLD:    0x22,
    ENTITY_SPAWN:   0x30,
    ENTITY_DESPAWN: 0x31,
    ENTITY_MOVE:    0x32,
    HP_UPDATE:      0x33,
    PING:           0xF0,
    PONG:           0xF1
};

// Constantes diretas (atalhos)
export const CHAT           = PacketTypes.CHAT;
export const CHAR_LIST      = PacketTypes.CHAR_LIST;
export const CHAR_SELECT    = PacketTypes.CHAR_SELECT;
export const MOVE           = PacketTypes.MOVE;
export const ATTACK         = PacketTypes.ATTACK;
export const SKILL          = PacketTypes.SKILL;
export const USE_ITEM       = PacketTypes.USE_ITEM;
export const DROP_ITEM      = PacketTypes.DROP_ITEM;
export const TALK_NPC       = PacketTypes.TALK_NPC;
export const BUY_ITEM       = PacketTypes.BUY_ITEM;
export const SELL_ITEM      = PacketTypes.SELL_ITEM;
export const ADD_STATS      = PacketTypes.ADD_STATS;
export const WARP           = PacketTypes.WARP;
export const TRADE_REQ      = PacketTypes.TRADE_REQ;
export const PARTY_REQ      = PacketTypes.PARTY_REQ;
export const LOGIN_REQ      = PacketTypes.LOGIN_REQ;
export const LOGIN_RES      = PacketTypes.LOGIN_RES;
export const ENTER_WORLD    = PacketTypes.ENTER_WORLD;
export const ENTITY_SPAWN   = PacketTypes.ENTITY_SPAWN;
export const ENTITY_DESPAWN = PacketTypes.ENTITY_DESPAWN;
export const ENTITY_MOVE    = PacketTypes.ENTITY_MOVE;
export const HP_UPDATE      = PacketTypes.HP_UPDATE;
export const PING           = PacketTypes.PING;
export const PONG           = PacketTypes.PONG;

// Mapa invertido: valor -> nome (útil para logs/debug)
export const PacketNames = Object.freeze(
    Object.fromEntries(Object.entries(PacketTypes).map(([name, value]) => [value, name]))
);

export default PacketTypes;
