# AGENTS.md

Project conventions for AI coding agents working on `ink-cartridge` — a library that enhances Ink without replacing it: it supplies the foundational interaction layer for interaction-dense, multi-page terminal UIs (a screen system and a layered keyboard engine), rather than an all-in-one framework or a component kit. Built with React context + `useReducer`/`useRef` (no third-party state management).

## Stack

- TypeScript 5.9, strict mode, Node16 modules, ES2022 target, JSX (`"jsx": "react"`)
- React 19 + Ink 7 (terminal UI framework)
- vitest 4.x with `ink-testing-library` (synchronous `render()` in node environment — returns `{ lastFrame, stdin, unmount }`, key presses via `stdin.write()`)
- No third-party state management

## Commands

```bash
npm run build          # keyboard-engine → core (tsc) → 14 component packages → i18n/theme/event/init (explicit order)
npm run watch          # tsc --watch (core only); per-package watch: npm run watch -w @cartridge-engine/<pkg>
npm test               # vitest run (all workspace projects)
npm run test:watch     # vitest --watch
npm run test:coverage  # vitest run --coverage
npm run lint           # eslint src/ packages/
npm run lint:fix       # eslint --fix src/ packages/
npm run lint:quick     # eslint src/ packages/ --quiet --cache
npm run clean          # rm -rf dist
```

Per-demo: `npx tsx examples/<pkg>/<Demo>.demo.tsx` (see `examples/README.md`).

## Done

A task is not complete until:
1. `npm run build` exits zero
2. `npm test` exits zero
3. Public API changes are reflected in `src/index.ts` (typedoc docs auto-publish to GitHub Pages)

## Architecture

**Screen System** (`src/screen/`) — Tree-based navigation via `registerComponent(Component, template, { parent })`. Navigation: `skip()` (down), `back()` (up, `levels` param), `gotoScreen()` (jump via LCA). Layer system: `openLayer()` / `closeLayer()` (ordinary layers) and `openModalLayer()` / `closeModalLayer()` (modal layers with keyboard takeover), each with `applyElement()` / `eraseElement()`, `activateElement()` / `deactivateElement()`, and `closeAllLayer()` / `closeAllModalLayer()` variants. All nav and layer functions work as React hooks AND module-level imports (`_dispatchers` Set). `ScenarioManagementProvider` wraps the app; `CurrentScreen` renders the active screen.

**Keyboard System** (`src/keyboard/`) — Framework-agnostic keyboard engine (`KeyboardEngine` class) with React adapter (`KeyboardProvider`). Layered key bindings via 9-stage pipeline (highest to lowest priority): Modal → Composition (affectLayer:true) → GlobalSequence (affectLayer:true) → GlobalKeys (affectLayer:true) → Layer broadcast → Composition (affectLayer:false) → GlobalSequence (affectLayer:false) → GlobalKeys (affectLayer:false) → Screen stack (top→bottom). Each stage is an independent processor; the first to return `true` consumes the event (except Layer broadcast, which always returns `false`). Mechanisms: `boundKeyboard()` (per-screen), `penetration()` (pass-through), `stop()` (propagation barrier), `globalKeys()`, `globalSequence()`, `boundSequence()`. Composition engine for flag/needs key chains, mapping key (vim-style remap). Focus: `useFocusState(focusId)`, Tab/Shift+Tab cycling, `focusSet`/`focusNext`/`focusPrev`/`focusCurrent`, named focus groups (`activateFocusGroup`/`kickFocusGroup`). Shortcut/sequence actions, modal modes (`allowModal`/`useModalMissListener`), named conditions, custom processors ordered by `weight` — built-ins use default weights from `builtinProcessorWeights` — (`addProcessor`/`removeProcessor`/`kickProcessor`/`activeProcessor`/`setProcessorWeight` per-instance via `useKeyboard()`). Owner-independent engine operations are also exported as module-level functions (`src/keyboard/moduleApi.ts`, mirroring the screen system's module-level nav — e.g. `addProcessor`, `setMode`, `globalKeys`), `getEngine()`/`withOwner()` allow manual engine access, and `KeyboardProvider` accepts an `engine` prop to inject a pre-built instance. `KeyboardEngine` is exported for non-React frameworks (Vue, Svelte, etc.).

**Component Library** (`packages/`) — **deprecated**; no longer maintained, to be replaced by the rewritten `@cartridge-engine/ui`. The 14 `@cartridge-engine/*` packages (badge, confirm-dialog, divider, fold, form, key-hint, number-input, progress-bar, search-bar, search-input, select, spinner, tabs, text-input), each with own `src/`, `tests/`, `package.json`, `vitest.config.ts`, `README.md`. `select` bundles SelectInput + SelectRow + MultiSelectInput + shared tools. All interactive ones use `focusId`. Form system (`Form` + `Field`) with validation context, Ctrl+Enter submit. Components depend on the core via `peerDependencies` (`ink-cartridge`, `ink`, `react`); `search-bar` additionally depends on `@cartridge-engine/text-input`. When adding a package: add it to the root `build` script (before dependents) and to `vitest.config.ts` `projects` and CI's tsc checks.

`packages/cartridge-ui/` is `@cartridge-engine/ui` — a **UI kit with its own component set**, deliberately independent of the 14 component packages above (it does NOT re-export them). Early scaffold; APIs are not stable until 1.0.0. Current content: `Button` (mouse-driven — `callbacks.onClick` fires on click; it forwards its ref so an external `boundKeyboard(..., { ref, focusId })` can share the region and `clickOnFocus`/`enterOnFocus`/`leaveOffFocus` forward keyboard focus to that binding), `examples/Button.tsx` (run via `npx tsx packages/cartridge-ui/examples/Button.tsx`), `tests/button.test.tsx`. Known traps: (1) the ref-merge callback in `Button` MUST keep a stable identity — a new function every render makes React detach/re-attach the ref and the layout listener then re-renders forever ("Maximum update depth exceeded"); (2) Ink's Enter key is `"return"`, not `"enter"`; (3) `packages/cartridge-ui/tsconfig.json` maps `ink-cartridge` → root `src/` via `paths` for editor auto-imports — this breaks `tsc` builds (TS6059), so the examples/tests tsconfigs deliberately extend the ROOT tsconfig instead. Wire into the root `build` script, `vitest.config.ts` projects, and CI tsc checks when it ships.

`packages/editor/` is NOT a component package — it's `blots-editor`, a standalone Markdown-editor app (bin `blots-editor`) depending on `ink-cartridge`. It has its own `tests/` and vitest project and is built separately in the release workflow, but is absent from the root `build` script.

**Standalone packages**: `@cartridge-engine/i18n` (LanguageProvider + useI18n + `make-language-type`), `@cartridge-engine/theme` (ThemeProvider + useTheme + `make-theme-type`/`init-theme`), `@cartridge-engine/event` (EventBus + EventProvider + hooks), `@cartridge-engine/init` (project scaffold, bin `ink-cartridge-init`). Imported on demand; not part of the core barrel.

### examples

- `examples/` — single-API demos. "Here's how SelectInput works."

## Watch out for

- `penetration()` means **pass-through**, NOT "block". Makes keys transparent to lower layers. (Formerly `blockedKey`.)
- `KeyboardProvider` MUST nest inside `ScenarioManagementProvider`. Reversed silently breaks keyboard.
- `_dispatch` is set in `useEffect` — unavailable during `componentDidCatch`. Error boundaries calling layer/modal functions will find `_dispatch` is null.
- The `clearShortcutOperations` re-exported from `@cartridge-engine/keyboard-engine` is a no-op — keyboard state is per-instance via `KeyboardEngine`. The module-level `clearShortcutOperations` exported by `ink-cartridge` forwards to the mounted engine instead.
- Non-persistent layers and modal layers (`crossPage: false`) are removed on `skip`/`back`/`gotoScreen` (handled in reducer).
- `useRef<<T>` in TSX is parsed as JSX — must be `useRef<T>` (single `<`).
- Escape key (`\x1b`) is unreliable with `ink-testing-library`'s `stdin.write`.

## Coding conventions

### JSX
All new code MUST use JSX. `React.createElement` is forbidden.

### Type safety
- Avoid `any`. If unavoidable, comment why and which invariants you assert.
- Avoid `as`. If unavoidable, comment why the assertion is safe (e.g., "validated by `isValidTheme` above").
- Prefer `unknown` over `any`, narrow via type guards.
- If genuinely stuck with type safety, ask the user before writing unsafe code.

### Error handling
- All async operations must handle errors (try/catch).
- Error prefix: `[ink-cartridge]`.
- Ambiguous edge cases: ask the user before choosing throw/log/recover.

### File naming
- Components: `PascalCase.tsx`
- Non-components (utils, types, hooks, helpers): `camelCase.ts`
- Tests: match source file name + `.test.ts` or `.test.tsx`

### Props with .length/.map()
```tsx
function KeyHint({ keys = [] }: Props) { ... }
function TextInput({ value = '' }: Props) { ... }
```

### Comments
Explain **why**, not what. No decorative separators. See `docs-agents/comment-conventions.md` for full examples.

### No over-engineering
- Simplest code that passes tests. No abstractions "just in case."
- Extract patterns only after the 3rd occurrence.
- Ask before any non-trivial refactor.

## Testing

Core system tests go in `tests/` (NOT `src/__tests__/`). Component tests live inside each package (`packages/<pkg>/tests/`). Environment is `node` (configured in `vitest.config.ts`).

```
tests/<subsystem>/            # core: screens, keyboard
├── base/                     # basic logic tests
│   ├── _helpers.tsx          # shared utilities
│   └── *.test.ts(x)
└── *.test.tsx                # complex / special-case tests

packages/<pkg>/tests/base/    # per-package tests (own _helpers.tsx copy)
```

- Black-box, concise, precise, non-redundant.
- New behavior tests must be proven effective with a manual mutation test: temporarily break the implementation (revert a guard, flip a branch, change a value), run the test and confirm it FAILS, then restore the implementation and confirm the test passes again.
- Must compile (`tsc` passes under `tests/tsconfig.json` and each `packages/<pkg>/tests/tsconfig.json`).
- `clearRegistry()` in `beforeEach`; `clearDispatchers()` for module-level isolation.
- `ink-testing-library`: synchronous `render()`, effects need `flush()` (50ms), `stdin.write()` wrapped in `act()`.
- Package tests import same-package sources relatively (`../../src/...`), cross-package/core by package name (`@cartridge-engine/...`, `ink-cartridge`).

See `agents/rules/testing.md` (loaded when editing `tests/**/*`) and `docs-agents/test-patterns.md` for examples.

## Documentation

- Public API changes → run `npm run docs` to verify typedoc output, then update `src/index.ts`. Docs auto-publish to [GitHub Pages](https://cartridgebox.art/) on push to `main`. All API documentation lives in JSDoc — there are no hand-written API docs.
- `docs-agents/` is agent reference material (not user-facing docs).

## Changelog

A shipping change needs a changeset: one `.changeset/<name>.md` file. Agents write the **body**; the user decides the bump level (`patch`/`minor`/`major`, never a version number) in the frontmatter — `changesets/action` derives versions. A change spanning several packages shares one file: one frontmatter line per package, one body.

The body MUST be in English, neatly formatted, and use exactly these five sections, always all five and in this order. A section with no related change reads `None` on its own line — never drop the heading.

| Section | Covers | Old type prefix |
|---------|--------|-----------------|
| `### Added` | new features / capabilities | `feat` |
| `### Changed` | behavior, refactor, or docs changes | `refactor`, `docs` |
| `### Fixed` | bug fixes | `fix` |
| `### Breaking Changes` | backwards-incompatible changes | `breaking` |
| `### Tests` | added or updated tests | `test` |

One bullet per item, in English; the section already carries the type, so bullets take **no** type prefix (unlike the old `- **type**(scope): …` format). Applies to changesets written from 2026-10-01 onward — do not retro-reformat older entries.

The body MUST open with a one-line summary (the "commit line") before the first section. `@changesets/cli/changelog` renders an entry as `- <commit>: <first line of body>` and indents every later line by two spaces, and `@changesets/parse` runs `summary.trim()` — so a leading blank line is stripped and `### Added` would land glued after `- <hash>: `, where GitHub renders it as literal text, not a heading. A non-empty first line pushes `### Added` onto the second line, where the two-space list indent still parses as a heading.

```md
---
"ink-cartridge": minor
---
Add the module-level keyboard API.

### Added
- Module-level keyboard API: owner-independent engine operations are callable outside React.

### Changed
None

### Fixed
None

### Breaking Changes
None

### Tests
- `tests/keyboard/module-api.test.tsx` covers module-level forwarding, `withOwner` scoping, and render-time engine registration.
```

## Reference docs

| File | Load when |
|------|-----------|
| `docs-agents/comment-conventions.md` | Writing comments or JSDoc |
| `docs-agents/coding-patterns.md` | Writing components or hooks |
| `docs-agents/react-guidelines.md` | Writing React effects or callbacks |
| `docs-agents/test-patterns.md` | Writing tests |

## Conditional rules

| File | Trigger |
|------|---------|
| `agents/rules/testing.md` | `tests/**/*` |
| `agents/rules/components.md` | `packages/*/src/**` |
| `agents/rules/public-api.md` | `src/index.ts` |
| `agents/rules/examples.md` | `examples/**/*` |
| `agents/rules/comments.md` | `src/**/*`, `tests/**/*`, `examples/**/*`, `*.md` |

## CI/CD

- GitHub CI (`ci.yml`): `npm ci` → `npm run build` → `npm run lint` → tsc check (tests/, examples/, keyboard-engine/tests/, editor/tests/, all 14 package tests/, i18n/theme/event package tests) → `npx vitest run --coverage` on Node 22 & 24 for pushes/PRs to `main`.
- Release (`release.yml`): `npm run build` + `npm run build -w blots-editor`, then `changesets/action` opens a version PR and publishes on merge (`createGithubReleases: true`).
- Agents write the `.changeset/*.md` body (format in [Changelog](#changelog)); the user decides the bump level in the frontmatter.
