/**
 * test-protocol.js - Test suite for MU Protocol Implementation
 * Run in browser console or with a test runner
 */

import {
  MUPacketManager,
  CRC32,
  XOR_FILTER,
  BitPacking,
  BlockCipher,
  MAIN_OPCODE,
  F1_SUBCODE,
  F3_SUBCODE,
  HEADER_TYPE,
  createHeader,
  parseHeader,
  buxConvert,
  xorData,
  PSBMSG_HEAD,
  PBMSG_HEAD,
  createCharacterListRequest,
  createCharacterCreateRequest,
  createCharacterDeleteRequest,
  createCharacterSelectRequest,
  createPositionPacket,
  createMovePacket,
  encodeMovePath,
  createAttackPacket,
  createMagicPacket,
  createChatPacket,
  createWhisperPacket,
  createGetItemPacket,
  createDropItemPacket,
  createEquipmentItemPacket,
  createUseItemPacket,
  createAddPointPacket,
  createTradeRequestPacket,
  createTradeAnswerPacket,
  createTradeGoldPacket,
  createTradeResultPacket,
  createTradeExitPacket,
  createPartyRequestPacket,
  createPartyAnswerPacket,
  createPartyListPacket,
  createPartyLeavePacket,
  createGuildRequestPacket,
  createGuildAnswerPacket,
  createGuildListPacket,
  createVaultCostPacket,
  createStorageGoldPacket,
  createStorageExitPacket,
  createStoragePasswordPacket,
  createQuestHistoryPacket,
  createQuestStatePacket,
  createQuestSelectionPacket,
  createQuestCompletePacket,
  createTalkPacket,
  createBuyPacket,
  createSellPacket,
  createRepairPacket,
  createServerListRequestPacket,
  createServerAddressRequestPacket,
  createPingPacket,
  createCheckPacket,
  createEventChipPacket,
  createMutoNumberPacket,
  createGensJoiningPacket,
  createGensSecessionPacket,
  createDuelRequestPacket,
  PMSG_CONNECT_ACCOUNT_SEND,
  PMSG_SIMPLE_RESULT_RECV,
  PMSG_CHARACTER_LIST_RECV,
  PacketParser,
  MUProtocolStream,
  VERSION,
  PROTOCOL_VERSION,
  CHAR_CLASS,
  ACTION_CODE,
  LOGIN_RESULT,
  F4_SUBCODE,
  F8_SUBCODE,
  DUEL_SUBCODE,
  F6_SUBCODE
} from './index.js';

// Test utilities
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.error(`✗ ${message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  const equal = JSON.stringify(actual) === JSON.stringify(expected);
  if (equal) {
    console.log(`✓ ${message}`);
    passed++;
  } else {
    console.error(`✗ ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertBytesEqual(actual, expected, message) {
  if (actual.length !== expected.length) {
    console.error(`✗ ${message}: length mismatch (${actual.length} vs ${expected.length})`);
    failed++;
    return;
  }
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      console.error(`✗ ${message}: byte ${i} mismatch (0x${actual[i].toString(16)} vs 0x${expected[i].toString(16)})`);
      failed++;
      return;
    }
  }
  console.log(`✓ ${message}`);
  passed++;
}

console.log('=== MU Protocol Test Suite ===\n');
console.log(`Version: ${VERSION}`);
console.log(`Protocol: ${PROTOCOL_VERSION}\n`);

// ============================================================================
// Test CRC32
// ============================================================================
console.log('--- CRC32 Tests ---');
{
  const testData = new TextEncoder().encode('123456789');
  const crc = CRC32.compute(testData);
  // Known CRC32 of "123456789" = 0xCBF43926
  assertEqual(crc >>> 0, 0xCBF43926, 'CRC32 of "123456789"');
  
  // Test empty
  const emptyCrc = CRC32.compute(new Uint8Array(0));
  assertEqual(emptyCrc >>> 0, 0x00000000, 'CRC32 of empty data');
  
  // Test partial
  const part1 = new TextEncoder().encode('123');
  const part2 = new TextEncoder().encode('456789');
  let crcPartial = CRC32.fullCRC(part1);
  crcPartial = CRC32.partialCRC(crcPartial ^ 0xFFFFFFFF, part2) ^ 0xFFFFFFFF;
  assertEqual(crcPartial >>> 0, 0xCBF43926, 'CRC32 partial computation');
}

// ============================================================================
// Test BitPacking
// ============================================================================
console.log('\n--- BitPacking Tests ---');
{
  // Test getByteOfBit
  assertEqual(BitPacking.getByteOfBit(0), 0, 'getByteOfBit(0)');
  assertEqual(BitPacking.getByteOfBit(7), 0, 'getByteOfBit(7)');
  assertEqual(BitPacking.getByteOfBit(8), 1, 'getByteOfBit(8)');
  assertEqual(BitPacking.getByteOfBit(15), 1, 'getByteOfBit(15)');
  assertEqual(BitPacking.getByteOfBit(16), 2, 'getByteOfBit(16)');
  
  // Test addBits / extractBits roundtrip
  const target = new Uint8Array(16);
  const source = new Uint8Array([0x12, 0x34]); // 0x3412 little endian
  
  const newPos = BitPacking.addBits(target, 0, source, 0, 16);
  assertEqual(newPos, 16, 'addBits returns correct position');
  
  const extracted = new Uint8Array(2);
  BitPacking.extractBits(extracted, 0, target, 0, 16);
  assertBytesEqual(extracted, source, 'addBits/extractBits roundtrip');
  
  // Test shift
  const shiftTest = new Uint8Array([0x12, 0x34, 0x56, 0x78]);
  BitPacking.shift(shiftTest, 4, 4); // Shift right 4 bits
  // 0x12345678 >> 4 = 0x01234567
  assertEqual(shiftTest[0], 0x23, 'shift right byte 0');
  assertEqual(shiftTest[1], 0x45, 'shift right byte 1');
  assertEqual(shiftTest[2], 0x67, 'shift right byte 2');
  assertEqual(shiftTest[3], 0x78, 'shift right byte 3 (unchanged)');
}

// ============================================================================
// Test XOR Filter
// ============================================================================
console.log('\n--- XOR Filter Tests ---');
{
  const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  const original = new Uint8Array(testData);
  xorData(testData, 1, testData.length);
  
  // Verify XOR was applied
  let changed = false;
  for (let i = 1; i < testData.length; i++) {
    if (testData[i] !== original[i]) {
      changed = true;
      break;
    }
  }
  assert(changed, 'xorData modifies buffer');
  
  // Test reversibility (XOR twice = original)
  const testData2 = new Uint8Array(original);
  xorData(testData2, 1, testData2.length);
  xorData(testData2, 1, testData2.length);
  assertBytesEqual(testData2, original, 'xorData is reversible');
}

// ============================================================================
// Test BuxConvert
// ============================================================================
console.log('\n--- BuxConvert Tests ---');
{
  const testData = new Uint8Array([0x00, 0xFF, 0x55, 0xAA, 0x12, 0x34]);
  const original = new Uint8Array(testData);
  buxConvert(testData);
  
  for (let i = 0; i < testData.length; i++) {
    assertEqual(testData[i], (~original[i]) & 0xFF, `buxConvert byte ${i}`);
  }
  
  // Reversibility
  buxConvert(testData);
  assertBytesEqual(testData, original, 'buxConvert is reversible');
}

// ============================================================================
// Test Headers
// ============================================================================
console.log('\n--- Header Tests ---');
{
  // C1 header
  const c1Header = createHeader(HEADER_TYPE.C1, 0xF1, 0x01, 10);
  assertEqual(c1Header[0], HEADER_TYPE.C1, 'C1 header type');
  assertEqual(c1Header[1], 10, 'C1 header size');
  assertEqual(c1Header[2], 0xF1, 'C1 header head');
  assertEqual(c1Header[3], 0x01, 'C1 header subh');
  
  // C2 header
  const c2Header = createHeader(HEADER_TYPE.C2, 0xF3, 0x00, 0x1234);
  assertEqual(c2Header[0], HEADER_TYPE.C2, 'C2 header type');
  assertEqual(c2Header[1], 0x34, 'C2 header size low');
  assertEqual(c2Header[2], 0x12, 'C2 header size high');
  assertEqual(c2Header[3], 0xF3, 'C2 header head');
  assertEqual(c2Header[4], 0x00, 'C2 header subh');
  
  // Parse headers
  const parsedC1 = parseHeader(c1Header);
  assert(parsedC1 !== null, 'parseHeader C1');
  assertEqual(parsedC1.type, HEADER_TYPE.C1, 'parsed C1 type');
  assertEqual(parsedC1.size, 10, 'parsed C1 size');
  assertEqual(parsedC1.head, 0xF1, 'parsed C1 head');
  assertEqual(parsedC1.subh, 0x01, 'parsed C1 subh');
  
  const parsedC2 = parseHeader(c2Header);
  assert(parsedC2 !== null, 'parseHeader C2');
  assertEqual(parsedC2.type, HEADER_TYPE.C2, 'parsed C2 type');
  assertEqual(parsedC2.size, 0x1234, 'parsed C2 size');
  assertEqual(parsedC2.head, 0xF3, 'parsed C2 head');
  assertEqual(parsedC2.subh, 0x00, 'parsed C2 subh');
}

// ============================================================================
// Test PSBMSG_HEAD / PBMSG_HEAD
// ============================================================================
console.log('\n--- Packet Header Class Tests ---');
{
  const psbMsg = new PSBMSG_HEAD();
  psbMsg.set(0xF1, 0x01, 20);
  const psbBytes = psbMsg.toBytes();
  assertEqual(psbBytes[0], HEADER_TYPE.C1, 'PSBMSG_HEAD type');
  assertEqual(psbBytes[1], 20, 'PSBMSG_HEAD size');
  assertEqual(psbBytes[2], 0xF1, 'PSBMSG_HEAD head');
  assertEqual(psbBytes[3], 0x01, 'PSBMSG_HEAD subh');
  
  const parsedPsb = PSBMSG_HEAD.fromBytes(psbBytes);
  assertEqual(parsedPsb.head, 0xF1, 'PSBMSG_HEAD fromBytes head');
  assertEqual(parsedPsb.subh, 0x01, 'PSBMSG_HEAD fromBytes subh');
  
  const pbMsg = new PBMSG_HEAD();
  pbMsg.set(0x00, 15);
  const pbBytes = pbMsg.toBytes();
  assertEqual(pbBytes[0], HEADER_TYPE.C1, 'PBMSG_HEAD type');
  assertEqual(pbBytes[1], 15, 'PBMSG_HEAD size');
  assertEqual(pbBytes[2], 0x00, 'PBMSG_HEAD head');
  
  const encryptedPb = new PBMSG_HEAD();
  encryptedPb.setE(0xF1, 25);
  const encPbBytes = encryptedPb.toBytes();
  assertEqual(encPbBytes[0], HEADER_TYPE.C3, 'PBMSG_HEAD setE type');
}

// ============================================================================
// Test Packet Builders
// ============================================================================
console.log('\n--- Packet Builder Tests ---');
{
  // Character list request
  const charListReq = createCharacterListRequest(0);
  assert(charListReq.length > 4, 'Character list request has payload');
  assertEqual(charListReq[0], HEADER_TYPE.C1, 'Char list header type');
  assertEqual(charListReq[2], MAIN_OPCODE.CHARACTER, 'Char list opcode');
  assertEqual(charListReq[3], F3_SUBCODE.CHAR_LIST, 'Char list subcode');
  
  // Character create
  const charCreate = createCharacterCreateRequest('TestChar', CHAR_CLASS.DK, 0);
  assertEqual(charCreate[2], MAIN_OPCODE.CHARACTER, 'Char create opcode');
  assertEqual(charCreate[3], F3_SUBCODE.CHAR_CREATE, 'Char create subcode');
  
  // Character delete
  const charDelete = createCharacterDeleteRequest('TestChar', '12345678901234567890');
  assertEqual(charDelete[2], MAIN_OPCODE.CHARACTER, 'Char delete opcode');
  assertEqual(charDelete[3], F3_SUBCODE.CHAR_DELETE, 'Char delete subcode');
  
  // Character select
  const charSelect = createCharacterSelectRequest('TestChar');
  assertEqual(charSelect[2], MAIN_OPCODE.CHARACTER, 'Char select opcode');
  assertEqual(charSelect[3], F3_SUBCODE.JOIN_MAP_SERVER, 'Char select subcode');
  
  // Position
  const pos = createPositionPacket(100, 200);
  assertEqual(pos[2], MAIN_OPCODE.POSITION, 'Position opcode');
  assertEqual(pos[3], 100, 'Position X');
  assertEqual(pos[4], 200, 'Position Y');
  
  // Move
  const movePath = encodeMovePath(0, [10, 11, 12], [20, 21, 22], 13, 23);
  const move = createMovePacket({ x: 10, y: 20, path: movePath.path, pathCount: movePath.pathCount });
  assertEqual(move[2], MAIN_OPCODE.MOVE, 'Move opcode');
  
  // Attack
  const attack = createAttackPacket(0x1234, 0, ACTION_CODE.ATTACK1);
  assertEqual(attack[2], MAIN_OPCODE.ATTACK, 'Attack opcode');
  assertEqual(attack[3], 0x12, 'Attack target high');
  assertEqual(attack[4], 0x34, 'Attack target low');
  assertEqual(attack[5], ACTION_CODE.ATTACK1, 'Attack type');
  assertEqual(attack[6], 0, 'Attack dir');
  
  // Magic
  const magic = createMagicPacket(0x0040, 0x5678);
  assertEqual(magic[2], MAIN_OPCODE.MAGIC, 'Magic opcode');
  assertEqual(magic[3], 0x00, 'Magic type high');
  assertEqual(magic[4], 0x40, 'Magic type low');
  assertEqual(magic[5], 0x56, 'Magic target high');
  assertEqual(magic[6], 0x78, 'Magic target low');
  
  // Chat
  const chat = createChatPacket('Player1', 'Hello World!');
  assertEqual(chat[2], MAIN_OPCODE.CHAT, 'Chat opcode');
  
  // Whisper
  const whisper = createWhisperPacket('Target', 'Secret message');
  assertEqual(whisper[2], MAIN_OPCODE.WHISPER, 'Whisper opcode');
  
  // Get item
  const getItem = createGetItemPacket(0xABCD);
  assertEqual(getItem[2], MAIN_OPCODE.GET_ITEM, 'Get item opcode');
  
  // Drop item
  const dropItem = createDropItemPacket(5, 10, 20);
  assertEqual(dropItem[2], MAIN_OPCODE.DROP_ITEM, 'Drop item opcode');
  
  // Use item
  const useItem = createUseItemPacket(10, 0, 0);
  assertEqual(useItem[2], MAIN_OPCODE.USE_STATE_ITEM, 'Use item opcode');
  
  // Add point
  const addPoint = createAddPointPacket(0); // Strength
  assertEqual(addPoint[2], MAIN_OPCODE.CHARACTER, 'Add point opcode (F3)');
  assertEqual(addPoint[3], F3_SUBCODE.ADD_POINT, 'Add point subcode');
  
  // Trade
  const tradeReq = createTradeRequestPacket(0x1111, 0);
  assertEqual(tradeReq[2], MAIN_OPCODE.TRADE, 'Trade request opcode');
  
  const tradeAns = createTradeAnswerPacket(1, 0x2222);
  assertEqual(tradeAns[2], MAIN_OPCODE.TRADE_RESULT, 'Trade answer opcode');
  
  const tradeGold = createTradeGoldPacket(1000000);
  assertEqual(tradeGold[2], MAIN_OPCODE.TRADE_MY_GOLD, 'Trade gold opcode');
  
  const tradeResult = createTradeResultPacket(1);
  assertEqual(tradeResult[2], MAIN_OPCODE.TRADE_YOUR_RESULT, 'Trade result opcode');
  
  const tradeExit = createTradeExitPacket();
  assertEqual(tradeExit[2], MAIN_OPCODE.TRADE_EXIT, 'Trade exit opcode');
  
  // Party
  const partyReq = createPartyRequestPacket(0x3333);
  assertEqual(partyReq[2], MAIN_OPCODE.PARTY, 'Party request opcode');
  
  const partyAns = createPartyAnswerPacket(1, 0x4444);
  assertEqual(partyAns[2], MAIN_OPCODE.PARTY_RESULT, 'Party answer opcode');
  
  const partyList = createPartyListPacket();
  assertEqual(partyList[2], MAIN_OPCODE.PARTY_LIST, 'Party list opcode');
  
  const partyLeave = createPartyLeavePacket(0);
  assertEqual(partyLeave[2], MAIN_OPCODE.PARTY_LEAVE, 'Party leave opcode');
  
  // Guild
  const guildReq = createGuildRequestPacket(0x5555);
  assertEqual(guildReq[2], MAIN_OPCODE.GUILD, 'Guild request opcode');
  
  const guildAns = createGuildAnswerPacket(1, 0x6666);
  assertEqual(guildAns[2], MAIN_OPCODE.GUILD_RESULT, 'Guild answer opcode');
  
  const guildList = createGuildListPacket();
  assertEqual(guildList[2], MAIN_OPCODE.GUILD_LIST, 'Guild list opcode');
  
  // Warehouse
  const vaultCost = createVaultCostPacket();
  assertEqual(vaultCost[2], MAIN_OPCODE.VAULT_COST, 'Vault cost opcode');
  
  const storageGold = createStorageGoldPacket(1, 5000000);
  assertEqual(storageGold[2], MAIN_OPCODE.STORAGE_GOLD, 'Storage gold opcode');
  
  const storageExit = createStorageExitPacket();
  assertEqual(storageExit[2], MAIN_OPCODE.STORAGE_EXIT, 'Storage exit opcode');
  
  const storagePass = createStoragePasswordPacket(0, 1234, 'resident123');
  assertEqual(storagePass[2], MAIN_OPCODE.STORAGE_STATUS, 'Storage password opcode');
  
  // Quest
  const questHist = createQuestHistoryPacket();
  assertEqual(questHist[2], MAIN_OPCODE.QUEST_HISTORY, 'Quest history opcode');
  
  const questState = createQuestStatePacket(1, 2);
  assertEqual(questState[2], MAIN_OPCODE.QUEST_STATE, 'Quest state opcode');
  
  const questSel = createQuestSelectionPacket(100, 1);
  assertEqual(questSel[2], MAIN_OPCODE.QUEST_EXTENDED, 'Quest selection opcode (F6)');
  
  const questComp = createQuestCompletePacket(200);
  assertEqual(questComp[2], MAIN_OPCODE.QUEST_EXTENDED, 'Quest complete opcode (F6)');
  
  // NPC Talk
  const talk = createTalkPacket(0x7777);
  assertEqual(talk[2], MAIN_OPCODE.TALK, 'Talk opcode');
  
  // Shop
  const buy = createBuyPacket(5);
  assertEqual(buy[2], MAIN_OPCODE.BUY, 'Buy opcode');
  
  const sell = createSellPacket(3);
  assertEqual(sell[2], MAIN_OPCODE.SELL, 'Sell opcode');
  
  const repair = createRepairPacket(2, 10);
  assertEqual(repair[2], MAIN_OPCODE.REPAIR, 'Repair opcode');
  
  // Server list
  const serverList = createServerListRequestPacket();
  assertEqual(serverList[2], MAIN_OPCODE.SERVER_LIST, 'Server list opcode (F4)');
  assertEqual(serverList[3], F4_SUBCODE.SERVER_LIST, 'Server list subcode');
  
  const serverAddr = createServerAddressRequestPacket(1);
  assertEqual(serverAddr[2], MAIN_OPCODE.SERVER_LIST, 'Server address opcode (F4)');
  assertEqual(serverAddr[3], F4_SUBCODE.SERVER_CONNECT, 'Server address subcode');
  
  // Ping
  const ping = createPingPacket();
  assertEqual(ping[2], MAIN_OPCODE.PING, 'Ping opcode');
  
  // Check
  const check = createCheckPacket(100, 200);
  assertEqual(check[2], 0x0E, 'Check opcode');
  
  // Events
  const eventChip = createEventChipPacket(1, 2);
  assertEqual(eventChip[2], MAIN_OPCODE.EVENT_CHIP, 'Event chip opcode');
  
  const muto = createMutoNumberPacket();
  assertEqual(muto[2], MAIN_OPCODE.MUTO_NUMBER, 'Muto number opcode');
  
  // Gens
  const gensJoin = createGensJoiningPacket(1);
  assertEqual(gensJoin[2], MAIN_OPCODE.GENS_EXTENDED, 'Gens joining opcode (F8)');
  assertEqual(gensJoin[3], F8_SUBCODE.REQUEST_JOINING, 'Gens joining subcode');
  
  const gensSec = createGensSecessionPacket();
  assertEqual(gensSec[2], MAIN_OPCODE.GENS_EXTENDED, 'Gens secession opcode (F8)');
  assertEqual(gensSec[3], F8_SUBCODE.REQUEST_SECESSION, 'Gens secession subcode');
  
  // Duel
  const duelReq = createDuelRequestPacket(0x8888);
  assertEqual(duelReq[2], MAIN_OPCODE.DUEL, 'Duel request opcode');
  assertEqual(duelReq[3], DUEL_SUBCODE.REQUEST, 'Duel request subcode');
}

// ============================================================================
// Test MUPacketManager
// ============================================================================
console.log('\n--- MUPacketManager Tests ---');
{
  const pm = new MUPacketManager();
  
  // Test init
  pm.init();
  assertEqual(pm.getSize(), 0, 'PacketManager init clears buffer');
  
  // Test addData/extractPacket with C1
  const testPacket = createCharacterListRequest(0);
  assert(pm.addData(testPacket), 'addData succeeds');
  const extracted = pm.extractPacket();
  assert(extracted !== null, 'extractPacket returns packet');
  assertBytesEqual(extracted, testPacket, 'extractPacket returns correct data');
  
  // Test with incomplete packet
  pm.clear();
  const incomplete = testPacket.subarray(0, testPacket.length - 2);
  assert(pm.addData(incomplete), 'addData accepts incomplete');
  assert(pm.extractPacket() === null, 'extractPacket returns null for incomplete');
  
  // Test C2 header
  const c2Packet = createHeader(HEADER_TYPE.C2, 0xF3, 0x00, 10);
  const c2Payload = new Uint8Array(6);
  const fullC2 = new Uint8Array(c2Packet.length + c2Payload.length);
  fullC2.set(c2Packet, 0);
  fullC2.set(c2Payload, c2Packet.length);
  
  pm.clear();
  assert(pm.addData(fullC2), 'addData C2');
  const extractedC2 = pm.extractPacket();
  assert(extractedC2 !== null, 'extractPacket C2');
  
  // Test processOutgoingPacket (encryption would need keys)
  const plainPacket = createCharacterListRequest(0);
  const processed = pm.processOutgoingPacket(plainPacket);
  assertBytesEqual(processed, plainPacket, 'processOutgoingPacket without encryption returns same');
  
  // Test processIncomingPacket
  pm.clear();
  const incoming = pm.processIncomingPacket(testPacket);
  assert(incoming !== null, 'processIncomingPacket returns packet');
  assertBytesEqual(incoming, testPacket, 'processIncomingPacket correct');
}

// ============================================================================
// Test PMSG_CONNECT_ACCOUNT_SEND
// ============================================================================
console.log('\n--- Login Packet Tests ---');
{
  const version = new Uint8Array([1, 2, 3, 4, 5]);
  const serial = new Uint8Array(16).fill(0xAA);
  
  const login = new PMSG_CONNECT_ACCOUNT_SEND('testuser', 'testpass', version, serial);
  const loginBytes = login.toBytes();
  
  assert(loginBytes.length > 0, 'Login packet created');
  assertEqual(loginBytes[0], HEADER_TYPE.C1, 'Login packet header type');
  assertEqual(loginBytes[2], MAIN_OPCODE.CONNECT, 'Login packet opcode');
  assertEqual(loginBytes[3], F1_SUBCODE.LOGIN, 'Login packet subcode');
  
  // Test PMSG_SIMPLE_RESULT_RECV
  const mockResponse = new Uint8Array([
    HEADER_TYPE.C1, 0x06, MAIN_OPCODE.CONNECT, F1_SUBCODE.LOGIN, LOGIN_RESULT.SUCCESS_1
  ]);
  const result = PMSG_SIMPLE_RESULT_RECV.fromBytes(mockResponse);
  assert(result.isSuccess(), 'Login success detection');
  
  const failResponse = new Uint8Array([
    HEADER_TYPE.C1, 0x06, MAIN_OPCODE.CONNECT, F1_SUBCODE.LOGIN, LOGIN_RESULT.FAIL_PASSWORD
  ]);
  const failResult = PMSG_SIMPLE_RESULT_RECV.fromBytes(failResponse);
  assert(!failResult.isSuccess(), 'Login failure detection');
}

// ============================================================================
// Test PMSG_CHARACTER_LIST_RECV
// ============================================================================
console.log('\n--- Character List Parsing Tests ---');
{
  // Build a mock character list packet
  const header = new PSBMSG_HEAD();
  header.set(MAIN_OPCODE.CHARACTER, F3_SUBCODE.CHAR_LIST, 4 + 1 + 64); // 1 char
  
  const charData = new Uint8Array(64);
  let offset = 0;
  // Name (10 bytes)
  const nameBytes = new TextEncoder().encode('TestChar\0\0');
  charData.set(nameBytes, offset); offset += 10;
  // Level (2 bytes) - level 100
  charData[offset++] = 100 & 0xFF;
  charData[offset++] = (100 >> 8) & 0xFF;
  // Class (1 byte) - DK
  charData[offset++] = CHAR_CLASS.DK;
  // CtlCode (1 byte)
  charData[offset++] = 0;
  // CharSet (18 bytes)
  charData.fill(0, offset, offset + 18); offset += 18;
  // GuildName (8 bytes)
  charData.fill(0, offset, offset + 8); offset += 8;
  // MapNumber (1 byte)
  charData[offset++] = 0;
  // X (1 byte)
  charData[offset++] = 128;
  // Y (1 byte)
  charData[offset++] = 128;
  // PKLevel (1 byte)
  charData[offset++] = 0;
  
  const packet = new Uint8Array(header.toBytes().length + 1 + charData.length);
  packet.set(header.toBytes(), 0);
  packet[header.toBytes().length] = 1; // count
  packet.set(charData, header.toBytes().length + 1);
  
  const parsed = PMSG_CHARACTER_LIST_RECV.fromBytes(packet);
  assertEqual(parsed.count, 1, 'Character list count');
  assertEqual(parsed.characters.length, 1, 'Character list parsed count');
  assertEqual(parsed.characters[0].name, 'TestChar', 'Character name');
  assertEqual(parsed.characters[0].level, 100, 'Character level');
  assertEqual(parsed.characters[0].class, CHAR_CLASS.DK, 'Character class');
  assertEqual(parsed.characters[0].x, 128, 'Character X');
  assertEqual(parsed.characters[0].y, 128, 'Character Y');
}

// ============================================================================
// Test PacketParser
// ============================================================================
console.log('\n--- PacketParser Tests ---');
{
  const chatPacket = createChatPacket('Player', 'Hello');
  const parsed = PacketParser.parse(chatPacket);
  assert(parsed !== null, 'PacketParser.parse returns result');
  assertEqual(parsed.opcode, MAIN_OPCODE.CHAT, 'PacketParser opcode');
  
  const chatData = PacketParser.parseChat(chatPacket.subarray(
    chatPacket[0] === HEADER_TYPE.C1 ? 3 : 4
  ));
  assert(chatData !== null, 'PacketParser.parseChat');
  assertEqual(chatData.sender, 'Player', 'Chat sender');
  assertEqual(chatData.message, 'Hello', 'Chat message');
  
  const movePacket = createMovePacket({
    x: 10, y: 20,
    path: new Uint8Array([0x12, 0x34]),
    pathCount: 2
  });
  const moveData = PacketParser.parseMove(movePacket.subarray(3));
  assert(moveData !== null, 'PacketParser.parseMove');
  assertEqual(moveData.x, 10, 'Move X');
  assertEqual(moveData.y, 20, 'Move Y');
  
  const attackPacket = createAttackPacket(0x1234, 0, ACTION_CODE.ATTACK1);
  const attackData = PacketParser.parseAttack(attackPacket.subarray(3));
  assert(attackData !== null, 'PacketParser.parseAttack');
  assertEqual(attackData.attackerKey, 0x1234, 'Attack attacker key');
  
  const lifePacket = new Uint8Array([0x64, 0x00, 0xC8, 0x00]); // 100/200
  const lifeData = PacketParser.parseLife(lifePacket);
  assert(lifeData !== null, 'PacketParser.parseLife');
  assertEqual(lifeData.life, 100, 'Life current');
  assertEqual(lifeData.maxLife, 200, 'Life max');
  
  const levelPacket = new Uint8Array([50, 5, 0xC8, 0x00, 0x90, 0x01]); // level 50, 5 pts, 200 HP, 400 MP
  const levelData = PacketParser.parseLevelUp(levelPacket);
  assert(levelData !== null, 'PacketParser.parseLevelUp');
  assertEqual(levelData.level, 50, 'Level up level');
  assertEqual(levelData.levelUpPoint, 5, 'Level up points');
  assertEqual(levelData.maxLife, 200, 'Level up max life');
  assertEqual(levelData.maxMana, 400, 'Level up max mana');
}

// ============================================================================
// Test MUProtocolStream
// ============================================================================
console.log('\n--- MUProtocolStream Tests ---');
{
  const stream = new MUProtocolStream();
  
  const packet1 = createCharacterListRequest(0);
  const packet2 = createPingPacket();
  
  // Feed both packets at once
  const combined = new Uint8Array(packet1.length + packet2.length);
  combined.set(packet1, 0);
  combined.set(packet2, packet1.length);
  
  const packets = stream.feed(combined);
  assertEqual(packets.length, 2, 'Stream extracts 2 packets');
  assertBytesEqual(packets[0], packet1, 'Stream packet 1');
  assertBytesEqual(packets[1], packet2, 'Stream packet 2');
  
  // Feed partial then complete
  stream.clear();
  const partial = combined.subarray(0, 5);
  const rest = combined.subarray(5);
  
  let partialPackets = stream.feed(partial);
  assertEqual(partialPackets.length, 0, 'Stream returns 0 for partial');
  
  partialPackets = stream.feed(rest);
  assertEqual(partialPackets.length, 2, 'Stream extracts 2 after complete');
}

// ============================================================================
// Test OpCode Constants
// ============================================================================
console.log('\n--- OpCode Constant Tests ---');
{
  assertEqual(MAIN_OPCODE.CHAT, 0x00, 'CHAT opcode');
  assertEqual(MAIN_OPCODE.MOVE, 0xD4, 'MOVE opcode');
  assertEqual(MAIN_OPCODE.POSITION, 0x15, 'POSITION opcode');
  assertEqual(MAIN_OPCODE.ATTACK, 0x11, 'ATTACK opcode');
  assertEqual(MAIN_OPCODE.MAGIC, 0x19, 'MAGIC opcode');
  assertEqual(MAIN_OPCODE.CONNECT, 0xF1, 'CONNECT opcode');
  assertEqual(MAIN_OPCODE.CHARACTER, 0xF3, 'CHARACTER opcode');
  assertEqual(MAIN_OPCODE.SERVER_LIST, 0xF4, 'SERVER_LIST opcode');
  assertEqual(MAIN_OPCODE.TRADE, 0x36, 'TRADE opcode');
  assertEqual(MAIN_OPCODE.PARTY, 0x40, 'PARTY opcode');
  assertEqual(MAIN_OPCODE.GUILD, 0x50, 'GUILD opcode');
  assertEqual(MAIN_OPCODE.VAULT_COST, 0x80, 'VAULT_COST opcode');
  assertEqual(MAIN_OPCODE.QUEST_HISTORY, 0xA0, 'QUEST_HISTORY opcode');
  
  assertEqual(F1_SUBCODE.LOGIN, 0x01, 'F1 LOGIN subcode');
  assertEqual(F1_SUBCODE.JOIN_SERVER, 0x00, 'F1 JOIN_SERVER subcode');
  assertEqual(F1_SUBCODE.LOGOUT, 0x02, 'F1 LOGOUT subcode');
  
  assertEqual(F3_SUBCODE.CHAR_LIST, 0x00, 'F3 CHAR_LIST subcode');
  assertEqual(F3_SUBCODE.CHAR_CREATE, 0x01, 'F3 CHAR_CREATE subcode');
  assertEqual(F3_SUBCODE.CHAR_DELETE, 0x02, 'F3 CHAR_DELETE subcode');
  assertEqual(F3_SUBCODE.JOIN_MAP_SERVER, 0x03, 'F3 JOIN_MAP_SERVER subcode');
  assertEqual(F3_SUBCODE.INVENTORY, 0x10, 'F3 INVENTORY subcode');
  assertEqual(F3_SUBCODE.LEVEL_UP, 0x05, 'F3 LEVEL_UP subcode');
  
  assertEqual(SEND_OPCODE.LOGIN, 0xF1, 'SEND LOGIN opcode');
  assertEqual(SEND_OPCODE.CHAR_LIST, 0xF3, 'SEND CHAR_LIST opcode');
  assertEqual(SEND_OPCODE.MOVE, 0xD4, 'SEND MOVE opcode');
  assertEqual(SEND_OPCODE.ATTACK, 0x11, 'SEND ATTACK opcode');
  assertEqual(SEND_OPCODE.MAGIC, 0x19, 'SEND MAGIC opcode');
  
  assertEqual(getOpcodeName(0xF1), 'CONNECT', 'getOpcodeName CONNECT');
  assertEqual(getOpcodeName(0xF3), 'CHARACTER', 'getOpcodeName CHARACTER');
  assertEqual(getOpcodeName(0x99), 'UNKNOWN_99', 'getOpcodeName unknown');
  
  assertEqual(getSubcodeName(0xF1, 0x01), 'LOGIN', 'getSubcodeName F1 LOGIN');
  assertEqual(getSubcodeName(0xF3, 0x00), 'CHAR_LIST', 'getSubcodeName F3 CHAR_LIST');
  assertEqual(getSubcodeName(0xF3, 0x99), 'UNKNOWN_99', 'getSubcodeName unknown');
}

// ============================================================================
// Test Equipment Item Packet
// ============================================================================
console.log('\n--- Equipment Item Packet Test ---');
{
  const equipData = {
    srcType: 0,      // Inventory
    srcIndex: 10,
    itemType: 0x1A2B,
    level: 10,
    durability: 255,
    option1: 0x07,   // Skill + Luck + Option
    extOption: 0x08, // Excellent
    splitType: 0x80, // Period item
    spareBits: 0x00,
    socketOptions: new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF]),
    dstType: 1,      // Equipment
    dstIndex: 0      // Helm slot
  };
  
  const equipPacket = createEquipmentItemPacket(equipData);
  assertEqual(equipPacket[2], MAIN_OPCODE.EQUIPMENT_ITEM, 'Equipment item opcode');
  assertEqual(equipPacket.length, 3 + 17, 'Equipment item packet size');
  
  // Verify payload
  assertEqual(equipPacket[3], equipData.srcType, 'Equip srcType');
  assertEqual(equipPacket[4], equipData.srcIndex, 'Equip srcIndex');
  assertEqual(equipPacket[5], equipData.itemType & 0xFF, 'Equip itemType low');
  assertEqual(equipPacket[6], equipData.level, 'Equip level');
  assertEqual(equipPacket[7], equipData.durability, 'Equip durability');
  assertEqual(equipPacket[8], equipData.option1, 'Equip option1');
  assertEqual(equipPacket[9], equipData.extOption, 'Equip extOption');
  assertEqual(equipPacket[10], equipData.splitType, 'Equip splitType');
  assertEqual(equipPacket[11], equipData.spareBits, 'Equip spareBits');
}

// ============================================================================
// Test Magic Attack Packet
// ============================================================================
console.log('\n--- Magic Attack Packet Test ---');
{
  const targets = [
    { key: 0x1111, skillSerial: 1 },
    { key: 0x2222, skillSerial: 2 },
    { key: 0x3333, skillSerial: 3 }
  ];
  
  const magicAttack = createMagicAttackPacket(0x0040, 100, 100, 5, targets);
  assertEqual(magicAttack[2], MAIN_OPCODE.MAGIC_ATTACK, 'Magic attack opcode');
  // 6 header bytes + 3 targets * 3 bytes = 15 payload + 3 header = 18
  assertEqual(magicAttack[3], 0x00, 'Magic attack type high');
  assertEqual(magicAttack[4], 0x40, 'Magic attack type low');
  assertEqual(magicAttack[5], 100, 'Magic attack X');
  assertEqual(magicAttack[6], 100, 'Magic attack Y');
  assertEqual(magicAttack[7], 5, 'Magic attack serial');
  assertEqual(magicAttack[8], 3, 'Magic attack count');
  
  // Verify targets
  assertEqual(magicAttack[9], 0x11, 'Target 1 key high');
  assertEqual(magicAttack[10], 0x11, 'Target 1 key low');
  assertEqual(magicAttack[11], 1, 'Target 1 serial');
  assertEqual(magicAttack[12], 0x22, 'Target 2 key high');
  assertEqual(magicAttack[13], 0x22, 'Target 2 key low');
  assertEqual(magicAttack[14], 2, 'Target 2 serial');
  assertEqual(magicAttack[15], 0x33, 'Target 3 key high');
  assertEqual(magicAttack[16], 0x33, 'Target 3 key low');
  assertEqual(magicAttack[17], 3, 'Target 3 serial');
}

// ============================================================================
// Test BlockCipher (structure only, no keys)
// ============================================================================
console.log('\n--- BlockCipher Structure Tests ---');
{
  const cipher = new BlockCipher();
  const testData = new Uint8Array(8);
  const target = new Uint8Array(11);
  
  // Without keys, encryption should still run (with zero keys)
  const result = cipher.encryptBlock(target, testData, 8);
  assertEqual(result, 11, 'encryptBlock returns 11 bytes');
  
  // Decrypt should fail checksum without proper keys
  const decryptTarget = new Uint8Array(8);
  const decryptResult = cipher.decryptBlock(decryptTarget, target);
  // Should return -1 due to checksum mismatch
  assert(decryptResult < 0 || decryptResult === 0, 'decryptBlock handles missing keys');
}

// ============================================================================
// Summary
// ============================================================================
console.log('\n=== Test Summary ===');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total:  ${passed + failed}`);

if (failed === 0) {
  console.log('\n✓ All tests passed!');
} else {
  console.error(`\n✗ ${failed} test(s) failed`);
}

// Export for external test runners
export { passed, failed };

export default {
  run: () => ({ passed, failed })
};