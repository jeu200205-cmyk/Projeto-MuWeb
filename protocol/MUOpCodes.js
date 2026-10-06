/**
 * MUOpCodes.js - OpCodes REAIS do MU Online Season 6 (main 1.03.34)
 * Baseado em: WSclient.cpp TranslateProtocol, wsclientinline.h, Protocol.cpp
 * 
 * Organização:
 * - Main OpCodes (0x00-0xFF)
 * - Extended OpCodes com SubCode (0xF1, 0xF3, 0xF4, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFB, 0xEB, 0xEF, 0x3F, 0xBC, 0xAA, 0x8E)
 */

// ============================================================================
// Main OpCodes (WSclient.cpp TranslateProtocol switch cases)
// ============================================================================

export const MAIN_OPCODE = {
  // Chat & Communication
  CHAT: 0x00,              // Normal chat
  CHAT_KEY: 0x01,          // Chat with key
  WHISPER: 0x02,           // Whisper chat
  CHECKSUM_REQUEST: 0x03,  // Checksum request
  EVENT: 0x0B,             // Event system
  WHISPER_RESULT: 0x0C,    // Whisper result
  NOTICE: 0x0D,            // Notice/GM message
  WEATHER: 0x0F,           // Weather

  // Movement & Position
  MOVE: 0xD4,              // PACKET_MOVE - Character move
  POSITION: 0x15,          // PACKET_POSITION - Position update

  // Character/Viewport
  CREATE_PLAYER: 0x12,     // Create character in viewport
  CREATE_MONSTER: 0x13,    // Create monster in viewport
  CREATE_SUMMON: 0x1F,     // Create summon in viewport
  CREATE_TRANSFORM: 0x45,  // Create transform in viewport
  DELETE_VIEWPORT: 0x14,   // Delete character/monster from viewport

  // Items
  CREATE_ITEM: 0x20,       // Create item on ground
  DELETE_ITEM: 0x21,       // Delete item from ground
  GET_ITEM: 0x22,          // Pick up item
  DROP_ITEM: 0x23,         // Drop item
  EQUIPMENT_ITEM: 0x24,    // Equipment item (wear/remove)
  CHANGE_CHARACTER: 0x25,  // Change character (class/skin)

  // Combat
  ATTACK: 0x11,            // PACKET_ATTACK - Normal attack
  ACTION: 0x18,            // Action (sit, pose, etc.)
  MAGIC: 0x19,             // Magic/skill cast
  MONSTER_SKILL: 0x69,     // Monster skill
  MAGIC_POSITION: 0x1A,    // Magic with position
  MAGIC_CONTINUE: 0x1E,    // Magic continue (multi-hit)
  MAGIC_FINISH: 0x1B,      // Magic finish
  SET_MAGIC_STATUS: 0x07,  // Set magic status (buff/debuff)
  DIE_EXP: 0x16,           // Die with exp loss
  DIE_EXP_LARGE: 0x9C,     // Die with large exp loss
  DIE: 0x17,               // Die (no exp)

  // Character Status
  DURABILITY: 0x2A,        // Item durability
  LIFE: 0x26,              // HP update
  MANA: 0x27,              // MP update
  DELETE_INVENTORY: 0x28,  // Delete item from inventory
  HELPER_ITEM: 0x29,       // Helper item (auto-pot, etc.)
  USE_STATE_ITEM: 0x2C,    // SendUseStateItem / ReceiveUseStatFruit (direction-specific)

  // NPC Interaction
  TALK: 0x30,              // Talk to NPC

  // Trade
  TRADE_INVENTORY: 0x31,   // Trade inventory open
  BUY: 0x32,               // Buy from NPC
  SELL: 0x33,              // Sell to NPC
  REPAIR: 0x34,            // Repair item
  TRADE: 0x36,             // Trade request
  TRADE_RESULT: 0x37,      // Trade result
  TRADE_YOUR_INV_DELETE: 0x38, // Trade your inventory delete
  TRADE_YOUR_INV: 0x39,    // Trade your inventory
  TRADE_MY_GOLD: 0x3A,     // Trade my gold
  TRADE_YOUR_GOLD: 0x3B,   // Trade your gold
  TRADE_YOUR_RESULT: 0x3C, // Trade your result (OK button)
  TRADE_EXIT: 0x3D,        // Trade exit

  // Teleport
  TELEPORT: 0x1C,          // Teleport
  TELEPORT_B: 0xB0,        // Teleport B (move gate)

  // Party
  PARTY: 0x40,             // Party request
  PARTY_RESULT: 0x41,      // Party result
  PARTY_LIST: 0x42,        // Party list
  PARTY_LEAVE: 0x43,       // Party leave
  PARTY_INFO: 0x44,        // Party info
  SET_ATTRIBUTE: 0x46,     // Set attribute (party)
  PARTY_GET_ITEM: 0x47,    // Party get item
  DISPLAY_EFFECT: 0x48,    // Display effect viewport

  // Guild
  GUILD: 0x50,             // Guild request
  GUILD_RESULT: 0x51,      // Guild result
  GUILD_LIST: 0x52,        // Guild list
  GUILD_LEAVE: 0x53,       // Guild leave
  CREATE_GUILD_INTERFACE: 0x54, // Create guild interface
  CREATE_GUILD_MASTER: 0x55,    // Create guild master interface
  CREATE_GUILD_RESULT: 0x56,    // Create guild result
  GUILD_ID_VIEWPORT: 0x65,      // Guild ID viewport
  GUILD_INFO: 0x66,             // Guild info
  DELETE_GUILD_VIEWPORT: 0x5D,  // Delete guild viewport
  DECLARE_WAR_RESULT: 0x60,     // Declare war result
  DECLARE_WAR: 0x61,            // Declare war
  GUILD_BEGIN_WAR: 0x62,        // Guild begin war
  GUILD_END_WAR: 0x63,          // Guild end war
  GUILD_WAR_SCORE: 0x64,        // Guild war score
  GUILD_ASSIGN: 0xE1,           // Guild assign
  GUILD_RELATIONSHIP: 0xE5,     // Guild relationship
  GUILD_RELATIONSHIP_RESULT: 0xE6, // Guild relationship result
  EDIT_GUILD_MARK: 0x55,        // Edit guild mark (same as create)
  EDIT_GUILD_TYPE: 0xE2,        // Edit guild type
  BAN_UNION_GUILD: 0xEB,        // Ban union guild (subcode 0x01)
  UNION_LIST: 0xE9,             // Union list

  // Warehouse/Vault
  VAULT_COST: 0x80,        // Vault cost
  STORAGE_GOLD: 0x81,      // Storage gold
  STORAGE_EXIT: 0x82,      // Storage exit
  STORAGE_STATUS: 0x83,    // Storage status
  STORAGE_COST: 0x84,      // Storage cost
  STORAGE_BUY: 0x85,       // Storage buy
  MIX: 0x86,               // Chaos machine mix
  MIX_EXIT: 0x87,          // Chaos machine exit

  // Map Move
  MOVE_MAP_CHECKSUM: 0x8E, // Move map checksum (subcode 0x01)
  REQUEST_MOVE_MAP: 0x8E,  // Request move map (subcode 0x03)

  // Custom Packets
  CUSTOM_PACKET: 0xFA,     // Custom packet (subcode in byte 4)

  // TradeX (Extended Trade)
  TRADEX_STATE: 0xFB,      // TradeX state (subcode 0x10)
  TRADEX_LIST: 0xFB,       // TradeX list (subcode 0x11)
  TRADEX_DEL_ITEM: 0xFB,   // TradeX delete item (subcode 0x13)
  ITEM_COUNTER: 0xFB,      // Item counter (subcode 0x2C)

  // Events
  MOVE_TO_DEVIL_SQUARE: 0x90,    // Move to devil square result
  EVENT_ZONE_OPEN_TIME: 0x91,    // Event zone open time
  DEVIL_SQUARE_COUNTDOWN: 0x92,  // Devil square countdown
  DEVIL_SQUARE_RANK: 0x93,       // Devil square rank
  MOVE_TO_EVENT_MATCH: 0x9A,     // Move to event match result
  MATCH_GAME_COMMAND: 0x9B,      // Match game command
  EVENT_CHIP_INFO: 0x94,         // Event chip information
  EVENT_CHIP: 0x95,              // Event chip
  MUTO_NUMBER: 0x96,             // Muto number
  SERVER_IMMIGRATION: 0x99,      // Server immigration
  SCRATCH_RESULT: 0x9D,          // Scratch card result
  PLAY_SOUND_EFFECT: 0x9E,       // Play sound effect
  EVENT_COUNT: 0x9F,             // Event count

  // Quest
  QUEST_HISTORY: 0xA0,       // Quest history
  QUEST_STATE: 0xA1,         // Quest state
  QUEST_RESULT: 0xA2,        // Quest result
  QUEST_PRIZE: 0xA3,         // Quest prize
  QUEST_MON_KILL_INFO: 0xA4, // Quest monster kill info

  // Pet
  PET_COMMAND: 0xA7,         // Pet command
  PET_ATTACK: 0xA8,          // Pet attack
  PET_INFO: 0xA9,            // Pet info

  // Duel
  DUEL: 0xAA,                // Duel system (subcodes 0x01-0x0D)

  // Empire Guardian
  EMPIRE_GUARDIAN: 0xF7,     // Empire Guardian (subcodes 0x02, 0x04, 0x06)

  // Personal Shop
  PERSONAL_SHOP: 0x3F,       // Personal shop (subcodes)

  // Gens System
  GENS: 0xF8,                // Gens system (subcodes)

  // NPC Dialog
  NPC_DLG: 0xF9,             // NPC Dialog (subcode 0x01)

  // Chaos Genesis
  CHAOS_GENESIS_OPEN: 0xEF,  // Chaos Genesis open (subcode 0x20)
  CHAOS_GENESIS_LIST: 0xEF,  // Chaos Genesis list (subcode 0x21)
  CHAOS_GENESIS_STATE: 0xEF, // Chaos Genesis state (subcode 0x23)

  // Gem Mix
  GEM_MIX: 0xBC,             // Gem mix (subcode 0x00)
  GEM_UNMIX: 0xBC,           // Gem unmix (subcode 0x01)

  // Preview
  PREVIEW_PORT: 0x68,        // Preview port

  // Ping
  PING: 0x71,                // Ping

  // Login/Server (Extended with SubCodes)
  CONNECT: 0xF1,             // Login/Connection (subcodes)
  CHARACTER: 0xF3,           // Character operations (subcodes)
  SERVER_LIST: 0xF4,         // Server list (subcodes)
  QUEST_EXTENDED: 0xF6,      // Extended quest (subcodes)
  GENS_EXTENDED: 0xF8,       // Gens extended (subcodes)
  NPC_DLG_EXTENDED: 0xF9,    // NPC Dialog extended (subcodes)
  CUSTOM_SOCKET: 0xFA,       // Custom socket
  TRADE_EXTENDED: 0xFB,      // Trade extended
  EMPIRE_GUARDIAN_EXT: 0xF7, // Empire Guardian extended
  PERSONAL_SHOP_EXT: 0x3F,   // Personal shop extended
};

// ============================================================================
// SubCodes for 0xF1 (Connection/Login)
// WSclient.cpp case 0xF1
// ============================================================================

export const F1_SUBCODE = {
  JOIN_SERVER: 0x00,       // Receive join server
  LOGIN: 0x01,             // Receive login result
  LOGOUT: 0x02,            // Receive logout
  CREATE_ACCOUNT: 0x12,    // Create account
  CONFIRM_PASSWORD: 0x03,  // Confirm password
  CONFIRM_PASSWORD2: 0x04, // Confirm password 2
  CHANGE_PASSWORD: 0x05,   // Change password
  HACK_CHECK: 0x03,        // Hack check (send)
};

// Login Result Values (WSclient.cpp lines 1308-1380)
export const LOGIN_RESULT = {
  SUCCESS_1: 0x01,         // Success
  SUCCESS_2: 0x20,         // Success (alternative)
  FAIL_PASSWORD: 0x00,     // Wrong password
  FAIL_ID: 0x02,           // ID not found
  FAIL_ID_CONNECTED: 0x03, // ID already connected
  FAIL_SERVER_BUSY: 0x04,  // Server busy
  FAIL_ID_BLOCK: 0x05,     // ID blocked
  FAIL_VERSION: 0x06,      // Version mismatch
  FAIL_CONNECT: 0x07,      // Connection failed
  FAIL_ERROR: 0x08,        // Error
  FAIL_NO_PAYMENT: 0x09,   // No payment info
  FAIL_USER_TIME1: 0x0A,   // User time limit 1
  FAIL_USER_TIME2: 0x0B,   // User time limit 2
  FAIL_PC_TIME1: 0x0C,     // PC time limit 1
  FAIL_PC_TIME2: 0x0D,     // PC time limit 2
  FAIL_ONLY_OVER_15: 0x11, // Only over 15
  FAIL_CHARGED_CHANNEL: 0x40, // Charged channel
  FAIL_POINT_DATE: 0xC0,   // Point date (C0/D0)
  FAIL_POINT_HOUR: 0xC1,   // Point hour (C1/D1)
  FAIL_INVALID_IP: 0xC2,   // Invalid IP (C2/D2)
};

// ============================================================================
// SubCodes for 0xF3 (Character)
// WSclient.cpp case 0xF3
// ============================================================================

export const F3_SUBCODE = {
  CHAR_LIST: 0x00,         // Character list
  CHAR_CREATE: 0x01,       // Create character
  CHAR_DELETE: 0x02,       // Delete character
  JOIN_MAP_SERVER: 0x03,   // Join map server (char select)
  REVIVAL: 0x04,           // Revival
  INVENTORY: 0x10,         // Inventory
  LEVEL_UP: 0x05,          // Level up
  ADD_POINT: 0x06,         // Add stat point
  DAMAGE: 0x07,            // Damage
  PK: 0x08,                // PK status
  MAGIC_LIST: 0x11,        // Magic/skill list
  EQUIPMENT: 0x13,         // Equipment
  MODIFY_ITEM: 0x14,       // Modify item
  SUMMON_LIFE: 0x20,       // Summon life
  WT_TIME_LEFT: 0x22,      // WT time left
  WT_MATCH_RESULT: 0x24,   // WT match result
  WT_GOAL_IN: 0x25,        // WT battle soccer goal in
  SOCCER_SCORE: 0x23,      // Soccer score
  OPTION: 0x30,            // Options
  SERVER_COMMAND: 0x40,    // Server command
  MASTER_EXP: 0x50,        // Master level exp
  MASTER_LEVEL_UP: 0x51,   // Master level up
  MASTER_GET_SKILL: 0x52,  // Master get skill
  ADD_POINTS: 0xE0,        // Add points (batch)
  CUSTOM_PREVIEW_LIST: 0x70, // Custom preview/name helper; shape-discriminated in router
  CUSTOM_PREVIEW_SET: 0x72,  // Custom preview char set
  PATENTE: 0xE9,           // Patente/ranking
};

// ============================================================================
// SubCodes for 0xF4 (Server List)
// WSclient.cpp case 0xF4
// ============================================================================

export const F4_SUBCODE = {
  SERVER_LIST: 0x06,       // Server list
  SERVER_CONNECT: 0x03,    // Server connect
  SERVER_BUSY: 0x05,       // Server busy
};

// ============================================================================
// SubCodes for 0xF6 (Extended Quest)
// WSclient.cpp case 0xF6
// ============================================================================

export const F6_SUBCODE = {
  QUEST_LIMIT_RESULT: 0x00,       // Quest time limit result
  QUEST_BY_ETC_EP_LIST: 0x03,     // Quest by etc EP list
  QUEST_BY_ITEM_USE_EP: 0x04,     // Quest by item use EP
  QUEST_BY_NPC_EP_LIST: 0x0A,     // Quest by NPC EP list
  QUEST_QS_SEL_SENTENCE: 0x0B,    // Quest QS select sentence
  QUEST_QS_REQUEST_REWARD: 0x0C,  // Quest QS request reward
  QUEST_COMPLETE_RESULT: 0x0D,    // Quest complete result
  QUEST_GIVE_UP: 0x0F,            // Quest give up
  PROGRESS_QUEST_LIST: 0x1A,      // Progress quest list
  PROGRESS_QUEST_REQUEST_REWARD: 0x1B, // Progress quest request reward
  PROGRESS_QUEST_LIST_READY: 0x20, // Progress quest list ready
  QUEST_SELECTION: 0x0A,          // Quest selection (send)
  QUEST_SEL_ANSWER: 0x0B,         // Quest select answer (send)
  QUEST_COMPLETE: 0x0D,           // Quest complete (send)
  SATISFY_QUEST: 0x10,            // Satisfy quest request (send)
  REQUEST_PROGRESS_LIST: 0x1A,    // Request progress list (send)
  REQUEST_PROGRESS_REWARD: 0x1B,  // Request progress reward (send)
  QUEST_GIVE_UP_SEND: 0x0F,       // Quest give up (send)
  REQUEST_ETC_EP_LIST: 0x21,      // Request etc EP list (send)
  REQUEST_NPC_EP_LIST: 0x30,      // Request NPC EP list (send)
  REQUEST_AP_DP_UP: 0x31,         // Request AP/DP up (send)
};

// ============================================================================
// SubCodes for 0xF7 (Empire Guardian)
// WSclient.cpp case 0xF7
// ============================================================================

export const F7_SUBCODE = {
  ENTER_EVENT: 0x02,       // Enter empire guardian event
  REMAIN_TICK: 0x04,       // Remain tick empire guardian
  RESULT: 0x06,            // Result empire guardian
};

// ============================================================================
// SubCodes for 0xF8 (Gens System)
// WSclient.cpp case 0xF8
// ============================================================================

export const F8_SUBCODE = {
  JOINING: 0x02,           // Gens joining
  SECESSION: 0x04,         // Gens secession
  PLAYER_INFLUENCE: 0x07,  // Player gens influence
  OTHER_INFLUENCE_VIEWPORT: 0x05, // Other player gens influence viewport
  REWARD: 0x0A,            // Gens reward
  REQUEST_JOINING: 0x01,   // Request gens joining (send)
  REQUEST_SECESSION: 0x03, // Request gens secession (send)
  REQUEST_REWARD: 0x09,    // Request gens reward (send)
  REQUEST_INFO_OPEN: 0x0B, // Request gens info open (send)
};

// ============================================================================
// SubCodes for 0xF9 (NPC Dialog)
// WSclient.cpp case 0xF9
// ============================================================================

export const F9_SUBCODE = {
  NPC_DLG_START: 0x01,     // NPC Dialog UI start
};

// ============================================================================
// SubCodes for 0xFA (Custom Socket)
// ============================================================================

export const FA_SUBCODE = {
  // Subcode is in byte 4 of packet
};

// ============================================================================
// SubCodes for 0xFB (TradeX / Item Counter)
// WSclient.cpp case 0xFB
// ============================================================================

export const FB_SUBCODE = {
  ITEM_COUNTER: 0x2C,      // Item counter
  TRADEX_STATE: 0x10,      // TradeX state
  TRADEX_LIST: 0x11,       // TradeX list
  TRADEX_DEL_ITEM: 0x13,   // TradeX delete item target
};

// ============================================================================
// SubCodes for 0x3F (Personal Shop)
// WSclient.cpp case 0x3F
// ============================================================================

export const SHOP_SUBCODE = {
  CREATE_TITLE: 0x00,      // Create shop title viewport
  SET_PRICE_RESULT: 0x01,  // Set price result
  CREATE_SHOP: 0x02,       // Create personal shop
  DESTROY_SHOP: 0x03,      // Destroy personal shop
  ITEM_LIST: 0x05,         // Personal shop item list
  PURCHASE_ITEM: 0x06,     // Purchase item
  NOTIFY_SOLD: 0x08,       // Notify sold item
  TITLE_CHANGE: 0x10,      // Shop title change
  CLOSE_SHOP: 0x12,        // Notify close personal shop
  REFRESH_LIST: 0x13,      // Refresh item list
};

// ============================================================================
// SubCodes for 0xAA (Duel)
// WSclient.cpp case 0xAA
// ============================================================================

export const DUEL_SUBCODE = {
  START: 0x01,             // Duel start
  REQUEST: 0x02,           // Duel request
  END: 0x03,               // Duel end
  SCORE: 0x04,             // Duel score
  HP: 0x05,                // Duel HP
  CHANNEL_LIST: 0x06,      // Duel channel list
  WATCH_REQUEST_REPLY: 0x07, // Duel watch request reply
  WATCHER_JOIN: 0x08,      // Duel watcher join
  WATCH_END: 0x09,         // Duel watch end
  WATCHER_QUIT: 0x0A,      // Duel watcher quit
  WATCHER_LIST: 0x0B,      // Duel watcher list
  RESULT: 0x0C,            // Duel result
  ROUND: 0x0D,             // Duel round
};

// ============================================================================
// SubCodes for 0xEB (Ban Union Guild)
// ============================================================================

export const EB_SUBCODE = {
  BAN_UNION_GUILD: 0x01,   // Ban union guild result
};

// ============================================================================
// SubCodes for 0xEF (Chaos Genesis / Gem Mix)
// WSclient.cpp case 0xEF
// ============================================================================

export const EF_SUBCODE = {
  BAN_UNION_GUILD: 0x01,   // Ban union guild result
  CHAOS_OPEN: 0x20,        // Chaos Genesis open
  CHAOS_LIST: 0x21,        // Chaos Genesis list
  CHAOS_STATE: 0x23,       // Chaos Genesis state
  GEM_MIX: 0x00,           // Gem mix result
  GEM_UNMIX: 0x01,         // Gem unmix result
};

// ============================================================================
// SubCodes for 0xBC (Gem Mix)
// ============================================================================

export const BC_SUBCODE = {
  MIX_RESULT: 0x00,        // Gem mix result
  UNMIX_RESULT: 0x01,      // Gem unmix result
};

// ============================================================================
// SubCodes for 0x8E (Move Map)
// ============================================================================

export const MOVE_MAP_SUBCODE = {
  CHECKSUM: 0x01,          // Move map checksum
  REQUEST: 0x03,           // Request move map
};

// ============================================================================
// Send OpCodes (wsclientinline.h macros)
// ============================================================================

export const SEND_OPCODE = {
  // Connection
  SERVER_LIST: 0xF4,       // SendRequestServerList (subcode 0x06)
  SERVER_ADDRESS: 0xF4,    // SendRequestServerAddress (subcode 0x03)
  WAREHOUSE_OPEN: 0xF3,    // SendRequestWareHouseOpen (subcode 0x53)
  LOGIN: 0xF1,             // SendRequestLogIn (subcode 0x01)
  CREATE_ACCOUNT: 0xF1,    // SendRequestCreateAccount (subcode 0x31)
  LOGOUT: 0xF1,            // SendRequestLogOut (subcode 0x02)
  CHAR_LIST: 0xF3,         // SendRequestCharactersList (subcode 0x00)
  CHAR_CREATE: 0xF3,       // SendRequestCreateCharacter (subcode 0x01)
  CHAR_DELETE: 0xF3,       // SendRequestDeleteCharacter (subcode 0x02)
  JOIN_MAP: 0xF3,          // SendRequestJoinMapServer (subcode 0x03)
  FINISH_LOADING: 0xF3,    // SendRequestFinishLoading (subcode 0x12)

  // Chat
  CHAT: 0x00,              // SendChat
  WHISPER: 0x02,           // SendChatWhisper
  CHECKSUM: 0x03,          // SendCheckSum

  // Hack Check
  HACK_CHECK: 0xF1,        // SendHackingChecked (subcode 0x03)

  // Movement
  POSITION: 0x15,          // SendPosition (PACKET_POSITION)
  MOVE: 0xD4,              // SendCharacterMove (PACKET_MOVE)
  ACTION: 0x18,            // SendRequestAction

  // Combat
  ATTACK: 0x11,            // SendRequestAttack (PACKET_ATTACK)
  MAGIC: 0x19,             // SendRequestMagic
  CANCEL_MAGIC: 0x1B,      // SendRequestCancelMagic
  MAGIC_ATTACK: 0xDB,      // SendRequestMagicAttack (PACKET_MAGIC_ATTACK)
  MAGIC_CONTINUE: 0x1E,    // SendRequestMagicContinue
  TELEPORT: 0x1C,          // SendRequestMagicTeleport
  TELEPORT_B: 0xB0,        // SendRequestMagicTeleportB

  // NPC
  TALK: 0x30,              // SendRequestTalk

  // Inventory/Trade
  EXIT_INVENTORY: 0x31,    // SendExitInventory
  BUY: 0x32,               // SendRequestBuy
  SELL: 0x33,              // SendRequestSell
  REPAIR: 0x34,            // SendRequestRepair
  TRADE_REQUEST: 0x36,     // SendRequestTrade
  TRADE_ANSWER: 0x37,      // SendRequestTradeAnswer
  TRADE_GOLD: 0x3A,        // SendRequestTradeGold
  TRADE_RESULT: 0x3C,      // SendRequestTradeResult
  TRADE_X_RESULT: 0x3C,    // SendRequestTradeXResult
  TRADE_EXIT: 0x3D,        // SendRequestTradeExit

  // Items
  GET_ITEM: 0x22,          // SendRequestGetItem
  DROP_ITEM: 0x23,         // SendRequestDropItem
  EQUIPMENT_ITEM: 0x24,    // SendRequestEquipmentItem
  USE_ITEM: 0x26,          // SendRequestUse
  ADD_POINT: 0xF3,         // SendRequestAddPoint (subcode 0x06)

  // Party
  PARTY_REQUEST: 0x40,     // SendRequestParty
  PARTY_ANSWER: 0x41,      // SendRequestPartyAnswer
  PARTY_LIST: 0x42,        // SendRequestPartyList
  PARTY_LEAVE: 0x43,       // SendRequestPartyLeave

  // Guild
  GUILD_MASTER: 0x54,      // SendRequestGuildMaster
  CREATE_GUILD: 0x55,      // SendRequestCreateGuild
  EDIT_GUILD_TYPE: 0xE2,   // SendRequestEditGuildType
  GUILD_RELATIONSHIP: 0xE5, // SendRequestGuildRelationShip
  GUILD_RELATIONSHIP_RESULT: 0xE6, // SendRequestGuildRelationshipResult
  BAN_UNION_GUILD: 0xEB,   // SendRequestBanUnionGuild (subcode 0x01)
  UNION_LIST: 0xE9,        // SendRequestUnionList
  EDIT_GUILD_MARK: 0x55,   // SendRequestEditGuildMark
  GUILD_REQUEST: 0x50,     // SendRequestGuild
  GUILD_ANSWER: 0x51,      // SendRequestGuildAnswer
  CREATE_GUILD_CANCEL: 0x57, // SendRequestCreateGuildCancel
  GUILD_LIST: 0x52,        // SendRequestGuildList
  GUILD_LEAVE: 0x53,       // SendRequestGuildLeave

  // Warehouse
  VAULT_COST: 0x80,        // SendRequestVaultCost
  VAULT_BUY: 0x85,         // SendRequestVaultBuy
  STORAGE_GOLD: 0x81,      // SendRequestStorageGold
  CHANGE_WARE: 0x84,       // SendRequestChangeWare
  STORAGE_EXIT: 0x82,      // SendRequestStorageExit
  STORAGE_PASSWORD: 0x83,  // SendStoragePassword

  // Map Move
  MOVE_MAP: 0x8E,          // SendRequestMoveMap (subcode 0x02)

  // Events
  EVENT_CHIP: 0x95,        // SendRequestEventChip
  MUTO_NUMBER: 0x96,       // SendRequestMutoNumber
  EVENT_CHIP_EXIT: 0x97,   // SendRequestEventChipExit
  LENA_EXCHANGE: 0x98,     // SendRequestLenaExchange
  SCRATCH_SERIAL: 0x9D,    // SendRequestScratchSerial
  SERVER_IMMIGRATION: 0x99, // SendRequestServerImmigration

  // Quest
  QUEST_HISTORY: 0xA0,     // SendRequestQuestHistory
  QUEST_STATE: 0xA2,       // SendRequestQuestState
  ATTRIBUTE: 0x9B,         // SendRequestAttribute
  QUEST_MON_KILL: 0xA4,    // SendRequestQuestMonKillInfo (subcode 0x00)
  QUEST_SELECTION: 0xF6,   // SendQuestSelection (subcode 0x0A)
  QUEST_SEL_ANSWER: 0xF6,  // SendQuestSelAnswer (subcode 0x0B)
  QUEST_COMPLETE: 0xF6,    // SendRequestQuestComplete (subcode 0x0D)
  SATISFY_QUEST: 0xF6,     // SendSatisfyQuestRequestFromClient (subcode 0x10)
  REQUEST_PROGRESS_LIST: 0xF6, // SendRequestProgressQuestList (subcode 0x1A)
  REQUEST_PROGRESS_REWARD: 0xF6, // SendRequestProgressQuestRequestReward (subcode 0x1B)
  QUEST_GIVE_UP: 0xF6,     // SendRequestQuestGiveUp (subcode 0x0F)
  REQUEST_ETC_EP_LIST: 0xF6, // SendRequestQuestByEtcEPList (subcode 0x21)
  REQUEST_NPC_EP_LIST: 0xF6, // SendRequestQuestByNPCEPList (subcode 0x30)
  REQUEST_AP_DP_UP: 0xF6,  // SendRequestAPDPUp (subcode 0x31)

  // Gens
  GENS_JOINING: 0xF8,      // SendRequestGensJoining (subcode 0x01)
  GENS_SECESSION: 0xF8,    // SendRequestGensSecession (subcode 0x03)
  GENS_REWARD: 0xF8,       // SendRequestGensReward (subcode 0x09)
  GENS_INFO_OPEN: 0xF8,    // SendRequestGensInfo_Open (subcode 0x0B)

  // Ping
  PING: 0x71,              // SendPing

  // Custom
  CUSTOM_PACKET: 0xFA,     // Custom socket packet
};

// ============================================================================
// Packet Header Types (Packets.h)
// ============================================================================

export const HEADER_TYPE = {
  C1: 0xC1,  // 1-byte size, no encryption
  C2: 0xC2,  // 2-byte size, no encryption
  C3: 0xC3,  // 1-byte size, encrypted
  C4: 0xC4   // 2-byte size, encrypted
};

// ============================================================================
// Direction Table (wsclientinline.h)
// ============================================================================

export const DIR_TABLE = new Int8Array([
  -1, -1,  // 0 — PC WSclient.cpp:153
   0, -1,  // 1
   1, -1,  // 2
   1,  0,  // 3
   1,  1,  // 4
   0,  1,  // 5
  -1,  1,  // 6
  -1,  0   // 7
]);

// ============================================================================
// Action Codes (wsclientinline.h)
// ============================================================================

export const ACTION_CODE = {
  ATTACK1: 0x00,
  ATTACK2: 0x01,
  ATTACK3: 0x02,
  SIT: 0x03,
  POSE1: 0x04,
  POSE2: 0x05,
  POSE3: 0x06,
  POSE4: 0x07,
  POSE5: 0x08,
  POSE6: 0x09,
  POSE7: 0x0A,
  POSE8: 0x0B,
  POSE9: 0x0C,
  POSE10: 0x0D,
  POSE11: 0x0E,
  POSE12: 0x0F,
  POSE13: 0x10,
  POSE14: 0x11,
  POSE15: 0x12,
  POSE16: 0x13,
  POSE17: 0x14,
  POSE18: 0x15,
  POSE19: 0x16,
  POSE20: 0x17,
  POSE21: 0x18,
  POSE22: 0x19,
  POSE23: 0x1A,
  POSE24: 0x1B,
  POSE25: 0x1C,
  POSE26: 0x1D,
  POSE27: 0x1E,
  POSE28: 0x1F,
};

// ============================================================================
// Item Types (for reference)
// ============================================================================

export const ITEM_TYPE = {
  // Weapons
  SWORD: 0,
  AXE: 1,
  MACE: 2,
  SPEAR: 3,
  BOW: 4,
  STAFF: 5,
  CROSSBOW: 6,
  SCEPTER: 7,
  
  // Armor
  HELM: 8,
  ARMOR: 9,
  PANTS: 10,
  GLOVES: 11,
  BOOTS: 12,
  WINGS: 13,
  GUARDIAN: 14,
  PENDANT: 15,
  RING: 16,
  
  // Consumables
  POTION: 17,
  SCROLL: 18,
  
  // Misc
  GEM: 19,
  QUEST: 20,
  MATERIAL: 21,
  PET: 22,
  MOUNT: 23,
};

// ============================================================================
// Character Classes
// ============================================================================

export const CHAR_CLASS = {
  DW: 0,       // Dark Wizard
  DK: 1,       // Dark Knight
  ELF: 2,      // Fairy Elf
  MG: 3,       // Magic Gladiator
  DL: 4,       // Dark Lord
  SUM: 5,      // Summoner
  RF: 6,       // Rage Fighter
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get subcode name for debugging
 */
export function getSubcodeName(mainOpcode, subcode) {
  switch (mainOpcode) {
    case MAIN_OPCODE.CONNECT:
      return Object.entries(F1_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.CHARACTER:
      return Object.entries(F3_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.SERVER_LIST:
      return Object.entries(F4_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.QUEST_EXTENDED:
      return Object.entries(F6_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.EMPIRE_GUARDIAN_EXT:
      return Object.entries(F7_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.GENS_EXTENDED:
      return Object.entries(F8_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.NPC_DLG_EXTENDED:
      return Object.entries(F9_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.TRADE_EXTENDED:
      return Object.entries(FB_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.PERSONAL_SHOP:
    case MAIN_OPCODE.PERSONAL_SHOP_EXT:
      return Object.entries(SHOP_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.DUEL:
      return Object.entries(DUEL_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.GUILD:
      return Object.entries(EB_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.CHAOS_GENESIS_OPEN:
    case MAIN_OPCODE.CHAOS_GENESIS_LIST:
    case MAIN_OPCODE.CHAOS_GENESIS_STATE:
      return Object.entries(EF_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.GEM_MIX:
    case MAIN_OPCODE.GEM_UNMIX:
      return Object.entries(BC_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    case MAIN_OPCODE.MOVE_MAP_CHECKSUM:
    case MAIN_OPCODE.REQUEST_MOVE_MAP:
      return Object.entries(MOVE_MAP_SUBCODE).find(([, v]) => v === subcode)?.[0] ?? `UNKNOWN_${subcode.toString(16)}`;
    default:
      return `SUBCODE_${subcode.toString(16)}`;
  }
}

/**
 * Get main opcode name
 */
export function getOpcodeName(opcode) {
  return Object.entries(MAIN_OPCODE).find(([, v]) => v === opcode)?.[0] ?? `UNKNOWN_${opcode.toString(16)}`;
}

export default MAIN_OPCODE;