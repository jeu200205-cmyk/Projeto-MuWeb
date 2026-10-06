# MUWEB SKILLS_PROTOCOL FIX80 SAFE — FROM FIX79

Parent exact: `MUWEB_R90_FIX79_PROTOCOL_WIRE_INTEGRATED_2026-10-05_FULL.zip`
Parent SHA-256: `bcaae3278e3249e81d227e2dffda2184e2349d0ffba0437ef12ccff66cc287ef`
Scope: skills/gameplay/monsters/bosses/protocol/viewport only. No central promotion.

## Other lanes checked before edit
- ITEMS_LUA FIX80 FROM FIX79 exists; untouched.
- MAPS_ENGINE M75 FROM FIX79 exists; untouched.

## Change
F3:E0 `ReceiveNewCharacterInfo` now accepts only the two physical bodies already proven by the same-lineage PC/mobile parity owner: 84-byte base or 144-byte body with the complete `GAMESERVER_EXTRA==0` View* block. Previously `>=84` was accepted, so 85..143 or >144 could publish a partial/mixed authoritative snapshot. Those variants now fail closed before `onNewCharacterInfo`.

No opcode, model, bitmap, joint, particle, bone, color, lifetime or timing was invented.

## Coverage matrix
| Area | State after this SAFE lane |
|---|---|
| F3:E0 NewCharacterInfo wire | CLOSED: exact 84/144B + atomic reject |
| F3:04 Revival | preserved |
| F3:06 AddPoint | preserved exact 16/56B |
| F3:51/F3:52 master | preserved |
| 0x19/1A/1E/1B ReceiveMagic transport | preserved |
| CustomMonsterEffect Rand gate | preserved |
| F3:24 | open; physical MAX_ID_SIZE/padding not proven here |
| F3:25 visual FX | open/no-op evidence; no invented FX |
| ReceiveMagic residual visual graphs | open unless exact PC graph is available |
| monster/boss attack FX | open unless exact stages/bones/lifetimes are available |

## Evidence / ownership
Existing FIX79 source comment for PcParseNewCharacterInfo records an 84B base and a 144B `GAMESERVER_EXTRA==0` extension. This tranche only closes the parser around those already-evidenced bodies; field offsets and consumer ownership are unchanged.

## Changed files
- `protocol/MUPacketRouter.js`
- `test-r90-fix80-f3e0-exact-contract.mjs`

## Tests
- `node --check protocol/MUPacketRouter.js` — PASS
- `test-r90-fix80-f3e0-exact-contract.mjs` — PASS (84/144 accepted; 0/1/83/85/100/143/145/168 rejected atomically)
- FIX68 F3:06 regression — PASS
- FIX69 F3:04 regression — PASS
- FIX71 F3:51 regression — PASS
- FIX73 F3:52 regression — PASS
- FIX63 CustomMonsterEffect Rand regression — PASS
- FIX79 0x2C and 0x48 regressions — PASS

## Limitation / next tranche
Do not infer F3:24 padding or F3:25 visual behavior. Next safe target is another exact lifecycle struct, or a ReceiveMagic/monster-boss owner only when PC Main 5.2 evidence closes every required stage/bone/lifetime/timing.
