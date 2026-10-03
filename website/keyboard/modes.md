# Modes

A mode is a named namespace for key bindings. A binding carrying `mode` only fires in that mode; one without fires in all modes (including no-mode). The common use is replicating vim's normal / insert.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | `mode` is one of the binding options |

## The binding `mode` option

- `mode` {string} Omitted, the binding fires in all modes (including no-mode); given, it fires only while `getCurrentMode()` equals it.

`boundKeyboard`, `boundSequence`, `globalKeys`, `globalSequence`, `penetration`, `stop`, `allowModal`, and composition / mapping entries all accept this option.

## addMode(mode)

Registers a mode name.

- `mode` {string} The mode name.
- Returns: {boolean} `true` when added; `false` when the mode already exists (idempotent).

## removeMode(mode)

Unregisters a mode name.

- `mode` {string} The mode name.
- Returns: {boolean} `true` when it existed and was removed.
- Note: this does **not** exit the mode. If the removed mode is active, `getCurrentMode()` still returns that name — call `setMode(null)` yourself.

## setMode(mode)

Switches the current mode.

- `mode` {string | null} The target mode; `null` enters no-mode.
- Returns: {boolean} `true` and switches when the mode is registered (or `null`); `false` and leaves the current mode **unchanged** when it is not registered.

## nextMode()

Cycles to the next mode. From no-mode it enters the **first** registered mode.

- Returns: nothing.

## prevMode()

Cycles to the previous mode. From no-mode the current index matches nothing, so it lands on the **second-to-last** registered mode rather than the last. To enter the mode list deterministically from no-mode, use `nextMode()`.

- Returns: nothing.

## getCurrentMode()

- Returns: {string | null} The current mode name; `null` in no-mode.

## Example

```tsx
const { addMode, removeMode, setMode, nextMode, boundKeyboard } = useKeyboard()

useEffect(() => {
  addMode("insert")
  const unbind = boundKeyboard("*", handleChar, { mode: "insert" })  // insert only
  return () => { unbind(); removeMode("insert") }
}, [addMode, removeMode, boundKeyboard])

// One shortcut cycles the mode
useEffect(() => boundKeyboard("escape", nextMode), [boundKeyboard, nextMode])
```

## Boundaries

- A `defaultMode` passed at construction is not validated against the registered modes.
- Outside React, the `KeyboardEngine` constructor's `EngineProps` accepts `modes?: string[]` and `defaultMode?: string` — the initial registrations and initial mode; the other methods keep the same names and meanings.
