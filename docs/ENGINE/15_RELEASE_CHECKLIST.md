# 15 — Release checklist

## Before code change

- Confirm newest central checkpoint.
- Record parent SHA/hash and source PC authority.
- Check whether another lane already owns the same subsystem.

## During port

- Identify exact PC owner and all state dependencies.
- Preserve packet/layout/timing/material/stage semantics.
- Keep missing evidence fail-closed.
- Avoid removing visual content for performance.

## Gates

- `node --check` changed production files.
- Focused new test.
- Selected regression tests for touched area.
- Generator determinism if generated tables changed.
- Secret scan before GitHub publication.

## Publish

- changed paths
- patch
- hashes
- source evidence
- validation result
- physical limitations
- updated `11_PORTABILITY_STATUS.md`
- updated `12_REMAINING_PORTS.md`
- tag/release only after intended acceptance level
