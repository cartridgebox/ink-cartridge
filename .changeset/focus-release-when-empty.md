---
"ink-cartridge": minor
"@cartridge-engine/keyboard-engine": minor
---
Add an opt-in engine option that drops a focus target once nothing binds to it.

### Added
- `releaseFocusWhenEmpty` engine option, threaded through `KeyboardProvider` as a prop: every binding method (`boundKeyboard`, `boundSequence`, `penetration`, `stop`, `allowModal`) takes a reference on the focus target it registers into, and the last holder to let go removes the target, handing focus to the group's first remaining one. Off by default.

### Changed
- `finalizeBoundKeyboard` takes an optional `onRelease` callback that runs on every unbind path — including the `once`/`times` self-unbind that bypasses the returned closure.
- `FocusTarget.refCount` (optional) carries the live-holder count, maintained only while the option is on.
- `LayerManager.focusUnregister` delegates to a layer-scoped `removeFocusTarget`, so a target can be removed without resolving the layer from the owner stack — binding cleanups run outside the React owner push.
- Focus-target resolution in `BindingService` funnels through `attachFocusTarget`/`focusReleaser`, replacing four duplicated `focusId` ternaries.
- `pushKeyEntries` reference-counts the rule it registers per key, so several registrations share one array entry and the entry is dropped only when the last holder releases it; its cleanup removes rules in place from the live array rather than assigning a filtered copy of the one it captured.
- Focus targets auto-activate per group instead of per layer: a group's first target claims focus whenever that group has no active target, so a second group no longer waits for an explicit `activateFocusGroup`.
- `allowModal` allow-lists are evaluated per scope: a when-disabled rule blocks only its own focus target's — or the layer's — allow for that key, instead of vetoing every other active target's.
- `BaseBoundKeyEntry.actionId` records the shortcut action a binding was registered through, so the action-key map can be cleaned up per registration.
- `examples/core/focus-release.demo.tsx` walks through the option with two focus groups: toggling a field mounts and unmounts the only holder of its target, and a live `focusCurrent()` readout shows the target going and coming back.

### Fixed
- A focus group no longer loses its focus when its only target is released and later re-registered. Activation used to be gated on the whole layer being unfocused, so with any other group focused the re-created target could never take its group's focus back — reachable through `focusUnregister` before, and triggered automatically on every re-bind once `releaseFocusWhenEmpty` is on.
- A kicked group is no longer reclaimed just because an existing target re-registers: only a newly created target claims its group's focus, so `kickFocusGroup` stays in effect until the group is re-activated explicitly or a new target registers in it. Named groups and the default group follow the same rule.
- Two registrations of the same key on one layer or focus target no longer interfere: unbinding one used to strip the rule the other still needed, and a later cleanup could then resurrect an entry it had captured earlier. Affects `stop`, `penetration`, and `allowModal`.
- Two live bindings of one shortcut action no longer interfere: unbinding one used to drop the key from the layer's action-key map, leaving the other binding unresolvable for `stop(..., { stopAction: true })` and `modifyAction`.

### Breaking Changes
- A screen with named focus groups now has focus active in each group from registration. Code that relied on only the first group being active, or on `activateFocusGroup` returning `true` for a freshly registered group, must adapt — that call now only helps a group left empty by `kickFocusGroup`.
- `allowModal` evaluates each allow-list on its own: a conditionally disabled rule no longer blocks the same key for other active focus targets or for the layer-level list.

### Tests
- `tests/engine/base/focus-release.test.ts` covers release on last unbind, focus hand-off, shared/sequence/penetration/stop holders, idempotent cleanups, `once` self-unbind, per-group release, a re-registered group target regaining focus, and stale references that must not delete a re-registered target.
- `tests/engine/base/LayerManager.test.ts` covers per-group auto-activation, the single-target group case, and a kicked group not being reclaimed by a re-registration.
- `tests/pure-functions/base/pure.test.ts` covers a shared rule surviving its first holder's release, a duplicated cleanup releasing once, the stale-array resurrection, and action-key map entries scoped to their own action.
- `tests/engine/base/engine.test.ts` covers a shared action staying resolvable after one of its bindings unbinds.
- `tests/keyboard/focus-release.test.tsx` covers the provider prop end to end: unmounting a group's last holder releases the target and re-mounting takes its focus back, while the target stays registered with the option off.
- `tests/processors/base/processors.test.ts` covers a key staying stopped while a second holder of the same rule remains, and a when-disabled `allowModal` rule staying scoped to its own target or layer list.
