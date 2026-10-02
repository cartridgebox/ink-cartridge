# @cartridge-engine/confirm-dialog

## 3.0.0

### Patch Changes

- Updated dependencies [44dfa6a]
  - ink-cartridge@5.3.0

## 2.0.0

### Patch Changes

- 2ad5ef2: ### boundSequence: third calling convention — explicit keys + sequence action id

  `boundSequence` now supports `boundSequence(keys, actionId, options?)` alongside the existing explicit-keys+callback and action-id forms. The action's callback is resolved at registration time; its preset timeout acts as a default, overridable per call. The action does **not** need preset keys in this form, and the explicit keys take precedence over any preset ones. Type signatures updated across `KeyboardEngine`, `KeyboardContextValue`, and the React `useKeyboard` adapter (including `SequenceReactOptions` for `ref`-based region focus).

  ### boundSequence focusId creates its focus target

  A `focusId`-scoped `boundSequence` now lazily creates (and auto-activates, when first) the focus target on its layer — matching `boundKeyboard`. Previously the sequence's focus filtering could never match because `currentFocusIds` stayed empty, and `focusSet` on such an id threw "focus target not found".

  ### Region focus: mouse → keyboard focus convergence

  Clicking a mouse region (`useMouseRegion`) now forwards keyboard focus to the `focusId` recorded by a `boundKeyboard`/`boundSequence` `{ ref, focusId }` call, so the mouse and the keyboard converge on one focus target. Forwarding runs before the user's own `onClick`, and components react via `useFocusState`.

  - `clickOnFocus` (default `true`) — click forwards focus; set `false` to keep clicks purely on the mouse callbacks
  - `enterOnFocus` — hover enter forwards focus
  - `leaveOffFocus` (default `true`, only when `enterOnFocus` is set) — hover leave clears focus via `kickFocusGroup`; `false` keeps it
  - Layer/modal scoping mirrors keyboard ownership: the owning element's `regionFocus` map is resolved and the element id is injected, so regions inside layers and modals forward correctly
  - Region entries no longer carry a transient `focused` flag
  - New public types: `RegionFocusEntry`, `RegionFocusMap`, `Page`, `FocusRef`, `SequenceReactOptions`

  ### Keyboard engine: reference-counted region-focus entries

  `registerMouseRegion`'s ref → focusId entries are reference-counted per map, so a ref shared by several bindings is only released when the last binding unbinds.

  ### confirm-dialog

  Test mocks updated for the `regionFocus` field on layer/modal state.

  ### keyboard-engine: additional public type exports

  `BaseBoundKeyEntry`, `PageBoundKeyEntry`, `PageKeyboardLayer`, `ElementKeyboard`, `LayerKeyboardLayer`, `MissListener`, `FocusSetOptions`, `MouseEventBase`, `SGRMouseEvent`, `ESCMouseEvent`, `undo`, `ListenerFor`, `TypedEventListener`, `ErrorEventListener`, `EventByAction`, `ButtonType`, and `NoneButton` are now exported (previously reachable only through star re-exports); typedoc warnings resolved.

- Updated dependencies [2ad5ef2]
  - ink-cartridge@5.2.0

## 1.0.2

### Patch Changes

- f883b98: - **fix**(`ink-cartridge`): `useMouseRegion` no longer keeps a stale mouse hit area when an element's **absolute position** changes while its own relative layout stays fixed — e.g. a child control inside a draggable modal frame. The rect was previously re-measured only during render, so after dragging a modal frame the frame re-registered its new rect while the overlapping children (sensitivity bar, language rows) kept the pre-move rect: a press on the bar hit the frame instead, and the frame followed the cursor. The hook now subscribes to Ink's root layout listeners (the same `internal_layoutListeners` set `useBoxMetrics` uses) and re-measures unconditionally after every layout commit, so region rects follow ancestor moves even when the component never re-renders — which React's children bailout (unchanged element reference) and `useBoxMetrics` (own relative metrics only) both previously prevented.
  - **fix**(`blots-editor`): dragging the language / sensitivity modal frame no longer breaks the controls inside it — after moving the frame once, pressing and dragging the sensitivity bar (or clicking a language row) hits the control instead of re-dragging the frame.
  - **test**(`ink-cartridge`): `tests/keyboard/mouse-ancestor-move.test.tsx` reproduces the reported scenario — an absolutely-positioned draggable frame with an overlapping child region. It fails with the fix removed (a click at the child's new position lands on the frame) and passes with it in place.
- Updated dependencies [f883b98]
  - ink-cartridge@5.1.6

## 1.0.1

### Patch Changes

- cd29d4d: chore: Make the component monorepo
- Updated dependencies [cd29d4d]
  - ink-cartridge@5.1.1
