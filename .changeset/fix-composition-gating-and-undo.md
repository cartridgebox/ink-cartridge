---
"@cartridge-engine/keyboard-engine": patch
---
Fix composition-engine bugs around `when` gating, mapped chains, and undo removal.

### Added
None

### Changed
- `when` is now evaluated while filtering candidates, in one place shared by composition keys and mapping keys, so a closed gate skips only its own entry and a sibling entry for the same key with an open gate can still match. Previously composition `when` was checked only after a single entry had been selected, and mapping `when` was never read at all.
- The `isEndKey` JSDoc now matches the implementation: `execute` still runs before the end-key check (its side effects happen), but its returned context is discarded and the key is not recorded.

### Fixed
- Honour `when` on mapping keys — it was documented but never evaluated, so a gated mapping fired unconditionally. The gate is re-checked on every key of a sequence, mirroring `globalSequence`.
- Mapped target chains now pass the same gates as typed keys. A target key's `when` is honoured, and a `null` `lastFlag` uses the declared `flags` transition (`chooseFlag`) instead of falling back to `alternativeFlag`, so a chain behaves identically whether it is typed or triggered through `addMapping`. Value-schema input validation reads the running chain's own value, so a mapped continuation key is no longer checked against the engine's idle context (which made any schema-guarded mapped chain break where typing it worked). `runTargetChain` and `processPending` now share one `executeResolvedKey` helper so the two paths cannot drift.
- `undo` no longer deletes sequences it did not undo. When a sequence's `undoAction` returns `null` and stops the walk, the sequences not reached stay in the buffer and only the entries actually undone are removed — a partially-undone sequence is truncated rather than dropped, and its already-run actions are not replayed by the next undo. The `undone` event now reports how many sequences were actually undone instead of the requested count, matching its documentation, and fires even when the walk stopped before completing a sequence but still truncated one (with `steps: 0`), so subscribers can re-read the ledger.
- A single-key mapping whose target chain breaks no longer falls through to a composition key sharing the same head, which previously fired the same physical key twice.
- A mapped target chain that ends by design reaches the undo ledger like a typed one: when `execute` returns `null`, the keys already executed are recorded (the mapping still reports `broken`), and when a target key matches an `isEndKey`, the mapping reports `completed` and records them. Previously both cases discarded the executed keys and reported `broken`, so the same keys were undoable when typed and un-undoable when mapped.
- Include a string `when` in the composition fingerprint so two entries that differ only by their condition id are no longer silently deduplicated.

### Breaking Changes
None

### Tests
- `tests/composition/base/composition-regression.test.ts` covers gated single- and multi-key mappings, `when` parity, declared-flag transitions and schema-validated continuations in mapped target chains, released mappings not reaching composition, mapped chains that end by design (end key → `completed`, `execute` returning `null` → `broken`, both undoable), partial undo removal (isolated and flat, including a truncated sequence whose already-run actions must not replay), and string-`when` entry selection. Each new test was mutation-verified.
