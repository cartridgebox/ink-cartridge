---
name: examples
description: Conventions for example files under examples/ — naming, structure, and content rules
paths: ["examples/**/*"]
---

## Naming

Every demo lives directly in `examples/` as one flat file named `<group>-<name>.tsx`, where `<group>` is the subsystem it demonstrates:

- `keyboard-*` — keyboard engine demos (`keyboard-module-api.tsx`, `keyboard-dormant-key.tsx`)
- `mouse-*` — mouse region demos (`mouse-hover-focus.tsx`, `mouse-sequence.tsx`)
- `screen-*` — navigation and layer demos (`screen-goto-screen.tsx`, `screen-layer-persistence.tsx`)

No subdirectories: the prefix is what keeps the groups apart.

## Content

- One demo file per component variant. Split different modes into separate files (e.g. single vs. multi).
- All text (labels, descriptions, UI strings) must be in English. No Chinese characters.
- Prefer JSX over `React.createElement`.
- Demos are single-API showcases. Multi-system stress scenarios live in the package/engine test suites, not in examples.

## Overlays and modals

Overlays and modals must be visually floating on top of the screen, not rendered inline below it. Ink renders children in a flex column by default — without explicit positioning, overlays/modals appear as appended content at the bottom.

Every demo that uses overlays or modals must follow these rules:

1. **`fullScreen` on the provider** — `ScenarioManagementProvider` must receive `fullScreen` so the container fills the terminal viewport:
   ```tsx
   <ScenarioManagementProvider defaultScreen={Main} fullScreen>
   ```

2. **`position="absolute"` on the root Box** — the overlay/modal component's outermost Box must use Ink's absolute positioning:
   ```tsx
   <Box position="absolute" top={top} left={left} width={W} height={H} ...>
   ```

3. **Centered placement** — compute `top`/`left` from `useWindowSize()` to center the overlay/modal:
   ```tsx
   const { columns, rows } = useWindowSize();
   const top = Math.max(0, Math.floor((rows - height) / 2));
   const left = Math.max(0, Math.floor((columns - width) / 2));
   ```

4. **`backgroundColor`** — set a background color (typically `"black"`) so the floating element covers content behind it instead of rendering transparently on top.

5. **Accept `top`/`left` as props** — overlay/modal components should accept optional `top` and `left` props (following the `DevScreen` pattern), allowing callers to override the default centered placement. Use `useWindowSize()` as the fallback.

6. **Fixed dimensions** — declare `const OVERLAY_W` / `OVERLAY_H` constants at module level so the centering math is consistent.

## Imports

Import from the public API (`../src/index.js`, one level up from `examples/`) or from deep component paths. Either is acceptable as long as it's consistent within the file.

## No tests in examples/

Files ending in `_test.ts(x)` do not belong in `examples/`. Tests go in `tests/`.

## Entry in README

Every new demo must be added to `examples/README.md` — in the table for its group — with its run command.
