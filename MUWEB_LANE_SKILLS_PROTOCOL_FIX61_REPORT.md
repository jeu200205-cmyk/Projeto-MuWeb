# MUWEB Skills/Protocol lane — FIX61 candidate from FIX60
Parent authority: `MUWEB_R90_FIX60_QUEST_PROTOCOLS_CAPE_POSITION_2026-10-05_FULL.zip`. Before editing, ITEMS_LUA FIX61 and MAPS_ENGINE M61 lanes were present; this tranche does not touch their files/owners.

## PC evidence / exact contract closed
`WSclient.cpp::ReceiveMagicList` F3:11 uses `PHEADER_MAGIC_LIST_COUNT.Value` as the authoritative count: `Value==0xFF` consumes exactly one `Data2` to remove a skill; `Value==0xFE` consumes exactly one to set it; all other branches iterate `i < Data->Value`. `PRECEIVE_MAGIC_LIST` is 4 bytes (`Index`, LE `WORD Type`, `Level`).

FIX60 only required `(payload.length-2)%4==0`, so a malformed frame whose physical entries disagreed with `Value` could reach `onMagicList` and partially mutate the server-authoritative Skill[] mirror. This lane validates the exact count before callback/state mutation. No opcode, skill id, timing, model, effect or fallback was invented.

## Coverage
- F3:11 base list Value/count atomic gate: CLOSED.
- F3:11 ListType=2 removal Value/count gate: CLOSED.
- F3:11 FE single-set: exactly one entry: CLOSED.
- F3:11 FF single-remove: exactly one entry: CLOSED.
- 0x19/0x1A/0x1B/0x1E ReceiveMagic family: preserved from FIX60, not duplicated.
- BK/SM/Elf/MG/DL/Summoner visual owners: preserved, no speculative edit.
- Monster/boss CustomMonsterEffect: preserved; remains next evidence tranche.

## Changed files
`SOURCE/protocol/MUPacketRouter.js`; `SOURCE/tests/fix61-magiclist-count.mjs`.

## Validation
- focused FIX61 test: PASS for valid base/FE/FF plus truncated/oversized mismatch rejection.
- `node --check` touched router: PASS.
- `node --check skills/ServerMagicList.js`: PASS.
- Existing broad `protocol/test-protocol.js`: NOT GREEN on untouched legacy tests (MUPacketManager byte mismatch, login header C3-vs-C1 expectation, PacketParser attack null). These failures pre-exist outside the two changed files and are recorded rather than hidden; this lane does not claim the broad suite PASS.

## Next tranche
Audit exact ReceiveMagic visual branches still fail-closed, then CustomMonsterEffect/boss attack owners. Rebase semantically onto any newer central authority before promotion. This is a SAFE lane candidate, not central promotion.
