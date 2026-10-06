# MUWEB items/Lua lane — FIX61 candidate from FIX60

Parent authority: MUWEB R90 FIX60.
Status: SAFE LANE / NOT CENTRAL PROMOTION.

## Closed in this lane
`CurrentClientItemOwners.js` no longer assumes that `LoadItem(...)` and `LoadWing(...)` are confined to one physical Lua line. The previous regex stopped at `\\n`; a valid current-client Lua call formatted over multiple lines therefore produced zero owner rows. That failure propagates directly to custom item/custom wing model resolution and can make a valid equipped model fail closed as invisible.

The new balanced call scanner consumes the exact Lua call body across line breaks, preserves quoted strings and nested `GET_ITEM` / `GET_ITEM_MODEL` parentheses, and still feeds the existing strict argument/token validators. It does not add a fallback model, guessed wing, or commented Lua row.

## Coverage
- LoadItens.lua `LoadItem`: single-line retained; multiline now accepted.
- CustomWings.lua `LoadWing`: single-line retained; multiline now accepted.
- Nested GET_ITEM_MODEL/GET_ITEM calls: preserved.
- Wrong argument count/non-numeric fields/unknown expressions: still fail closed.
- CharacterCreateCape/FIX59 and quest/FIX60: untouched.

## Test
`test-r90-fix61-multiline-item-owners.mjs` proves a multiline armor LoadItem and multiline custom cape LoadWing resolve to their exact BMD paths and metadata. `node --check data/CurrentClientItemOwners.js` passes.

## Remaining lane debt
Do not claim all invisible wings fixed until the user's real Data is exercised. Next item-lane tranche should audit multiline parsing in CharacterHelper/CharacterCreateCape and verify exact equipped custom-wing BMD fetch + texture dependencies from the real Data manifest, then tooltip name/description owners.
