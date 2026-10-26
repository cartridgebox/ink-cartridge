---
"@cartridge-engine/keyboard-engine": minor
---
Rename the composition swallow option and stop a settled key from restarting its own chain.

### Added
None

### Changed
- The composition and mapping option is now `SwallowKeyWhenChainInterrupted`. The old name stated the opposite of the flag's behavior: `true` swallows the interrupting key, while the default (`false`) releases it to lower pipeline stages. The implementation and documentation already used that polarity, so only the name changes.
- The internal `KeyOutcome` field is now `swallow`, matching the mapping path, so `processPending` no longer returns a value named `release` whose `true` means "consumed".
- `processPending` and `processMappingKeyPending` report `"none" | "consumed" | "released"` instead of a boolean, so the caller can tell "the key is unrelated to the pending chain" from "the key took part in the chain and was settled by it".

### Fixed
- A key that settles a pending composition chain — `execute` returned `null`, `isEndKey` matched, or a value guard rejected it — is now only released to lower pipeline stages and is no longer re-read as a chain head. When the same physical key was also registered as a head (`optional: true` or `needs: []`), that re-read ran a second callback, emitted `completed` followed immediately by `started`, and left a phantom chain pending until its timeout. With an `exclusive` head the phantom chain also swallowed every later key until that timeout, and the timeout added a second entry to the undo buffer.
- A key that completed a mapping sequence whose target chain was interrupted is likewise released instead of being re-read as a composition head.

### Breaking Changes
- `KeyReleaseWhenChainInterrupted` is no longer read. Rename every occurrence to `SwallowKeyWhenChainInterrupted`; the value semantics are unchanged (`true` = swallow the breaking key).

### Tests
- `src/keyboard-engine/tests/composition/base/composition-edge.test.ts` and `composition-regression.test.ts` use the new option name.
- `composition-regression.test.ts` covers a same-key head/terminator (`execute` and `isEndKey`), the undo buffer recording the chain once, an `exclusive` head no longer swallowing later keys, unrelated keys still starting their own chain, and an interrupted mapping target not starting a composition head.
