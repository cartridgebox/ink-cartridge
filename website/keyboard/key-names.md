# Key names

The key names written in bindings (`"s"`, `"ctrl+q"`, `"return"`) are not what the terminal hands you directly — they are the result of `normalizeKeyNames` normalizing Ink's native key info. This page documents that transform and the two predicates that classify a key.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Basic Binding](/keyboard/base-bind) | The string key names you write in bindings are exactly what this page normalizes |

## normalizeKeyNames(input, key)

Normalizes Ink's native key info into an ordered array of key names.

- `input` {string} Printable characters; an empty string for special keys such as the arrows.
- `key` {unknown} Ink's modifier descriptor object.
- Returns: {string[]} The normalized key names, in match-priority order.

Rules: a special-key table is checked first (`return`, `escape`, `backspace`, `delete`, `up`, `down`, `left`, `right`, `tab`, `pagedown`, `pageup`, `home`, `end`) and returned on a hit. When the descriptor carries any modifier (`ctrl` / `shift` / `meta`), the bare name is dropped and the modifier variants are emitted instead, plus `ctrl+shift+<name>`; otherwise the raw `input` is used with the same modifier variants. An empty `input` with no match yields an empty array.

```ts
normalizeKeyNames("s", {})                            // ["s"]
normalizeKeyNames("s", { ctrl: true })                // ["ctrl+s"]
normalizeKeyNames("", { return: true })               // ["return"]
normalizeKeyNames("", { return: true, shift: true })  // ["shift+return"]
normalizeKeyNames("", { tab: true, shift: true })     // ["shift+tab"]
```

## isInkSpecialKey(key)

Reports whether Ink's key descriptor is a special key.

- `key` {unknown} Ink's key descriptor.
- Returns: {boolean} `true` for an arrow, `pageDown` / `pageUp` / `home` / `end`, `return` / `escape` / `tab` / `backspace` / `delete`, a modifier (`ctrl` / `meta` / `super` / `hyper`), or `eventType === "release"`.

## isNormalCharacter(input, key)

- `input` {string} Printable characters.
- `key` {unknown} Ink's key descriptor.
- Returns: {boolean} `true` when `input` is non-empty and `key` is not a special key.

Only normal characters are eligible for wildcard `"*"` matching. Use it to tell "an actual letter was typed" apart from "an arrow key was pressed".

## Uses

- **Custom host**: without React, `normalizeKeyNames` and `isNormalCharacter` are required when constructing a `KeyboardEngine`.
- **Input handling**: when building a text field, filter control keys with `isNormalCharacter`.
- **Stable spelling**: write binding strings in normalized form to stay consistent across terminals.
