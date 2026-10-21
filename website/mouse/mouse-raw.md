# Raw mouse API

`useMouseRegion` covers components. To consume parsed mouse events directly, use the `Mouse` class exported by `@cartridge-engine/keyboard-engine`—the same class the provider drives internally.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Mouse Regions](/mouse/mouse-base) | The component-level API and hit-testing |
| [Using the engine without React](/keyboard/non-react) | A non-React event loop |

## Construction

```ts
import { Mouse } from '@cartridge-engine/keyboard-engine'

const mouse = new Mouse(options?)
```

| Option | Effect | Default |
|---|---|---|
| `inputStream` | Stream carrying mouse reports | `process.stdin` |
| `outputStream` | Stream receiving terminal control sequences | `process.stdout` |
| `emitter` | Event emitter | new `EventEmitter` |
| `setRawMode` | Custom raw-mode switch | `inputStream.setRawMode` |
| `clickDistanceThreshold` | Maximum movement for a click (cells) | `1` |
| `pressStormThreshold` | Presses without a release before degraded click mode | `3` |
| `pressStormWindowMs` | Counting window (ms) | `500` |
| `degradedDedupDistance` | Dedup distance for synthesized clicks (cells) | `1` |
| `degradedDedupWindowMs` | Dedup window (ms) | `300` |

Degraded mode targets terminals that stop reporting releases (for example the VS Code integrated terminal): once the press count reaches the threshold, a press is synthesized into a click.

## Capability checks

```ts
Mouse.isSupported(inputStream?, outputStream?)   // boolean
Mouse.checkSupport(options?)                       // 'supported' | 'not_tty' | 'output_not_tty'
```

`Mouse.SupportCheckResult` exports the three constants.

```ts
if (!Mouse.isSupported()) {
  // Skip mouse support; the keyboard still works
}
```

## Lifecycle

```ts
mouse.enable()      // write enable sequences, enter raw mode
mouse.disable()     // restore the terminal
mouse.pause()       // stop parsing, stay enabled
mouse.resume()
mouse.isEnabled()
mouse.isPaused()
mouse.destroy()     // restore and release
```

A failed `enable()` rolls back what already took effect and throws `MouseError`. Call `destroy()` explicitly when done; do not rely on GC.

## Events

```ts
mouse.on('click', (event) => …)
mouse.once('wheel', (event) => …)
mouse.off('click', handler)
mouse.on('error', (error) => …)
```

Event names: `move`, `press`, `release`, `drag`, `wheel`, `click`, plus `error`.

`wheel` buttons are `wheel-up` / `wheel-down` / `wheel-left` / `wheel-right`; `move` uses `none`; `click` is synthesized; `drag` carries a real button.

```ts
mouse.on('click', (event) => {
  console.log(`${event.x},${event.y} ${event.button}`)
})
```

`mouse.getLastPosition()` returns the latest `{ x, y }`, or `null` before any event.

## Debounced move stream

```ts
for await (const event of mouse.debouncedMoveEvents({ interval: 100, signal })) {
  redraw(event.x, event.y)
}
```

Each interval yields the latest move. Moves arriving while the loop is busy are not lost; the next pull still returns one. Abort with `signal`, then call `destroy()`.

## Wiring into the engine

Hand raw events to the keyboard engine for region hit-testing:

```ts
const mouse = new Mouse()
mouse.enable()

mouse.on('click', (event) => engine.processMouseEvent(event))
engine.getHoveredMouseRegion()   // { layerId, regionId } | null
```

React hosts normally do not need this; `<KeyboardProvider mouse>` wires it already.

## Boundaries

- Requires TTY input and output; otherwise `enable()` throws.
- Do not create several `Mouse` instances in one process; they compete for raw mode and terminal sequences.
- `pause()` stops parsing but does not restore the terminal; use `disable()` or `destroy()` when leaving.
- Event coordinates are 1-based terminal coordinates, matching the `rect` used by `useMouseRegion`.
