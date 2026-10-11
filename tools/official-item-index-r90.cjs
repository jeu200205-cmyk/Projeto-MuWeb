'use strict';
// Main 5.2 item_por table: 16 sections, each with 512 records.
// This module maps only record identity. Names/stats remain exclusively
// from the official BMD and the authoritative GameServer respectively.
const SECTION_COUNT = 16;
const SLOTS_PER_SECTION = 512;
const RECORD_COUNT = SECTION_COUNT * SLOTS_PER_SECTION;
function recordIdentity(index) {
  if (!Number.isInteger(index) || index < 0 || index >= RECORD_COUNT) {
    throw new RangeError(`Invalid official item_por record index: ${index}`);
  }
  return { index, category: Math.floor(index / SLOTS_PER_SECTION), slot: index % SLOTS_PER_SECTION };
}
module.exports = { SECTION_COUNT, SLOTS_PER_SECTION, RECORD_COUNT, recordIdentity };
