# Organizing screens

Screens form a tree: each screen has at most one parent and any number of children. `registerComponent` builds it; `ScenarioManagementProvider` and `CurrentScreen` render it.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Quick Start](/quick-start-1) | The full provider nesting |

## registerComponent

```ts
registerComponent(component, template?, options?)
```

- `component` {ComponentType} The screen component; also the unique registration key.
- `[template]` {ComponentProps} Default props, merged with navigation `params`. **Default:** `{}`.
- `[options]` {RegisterOptions}
  - `[parent]` {ComponentType} Parent screen; omitted means a root screen.

```tsx
function Home() {
  return <Text>Home</Text>
}
registerComponent(Home)

function Settings() {
  return <Text>Settings</Text>
}
registerComponent(Settings, {}, { parent: Home })
```

Resulting tree:

```
Home
└── Settings
```

`registerComponent` is module-level; call it anywhere in a `.ts` / `.tsx` file, usually right after the component.

## Rendering

`ScenarioManagementProvider` holds the screen state and `CurrentScreen` renders the active screen:

```tsx
<ScenarioManagementProvider defaultScreen={Home} fullScreen>
  <KeyboardProvider>
    <CurrentScreen />
  </KeyboardProvider>
</ScenarioManagementProvider>
```

- `defaultScreen` must be registered, otherwise it throws.
- `fullScreen` makes the screen fill the terminal height.
- `KeyboardProvider` must be nested inside `ScenarioManagementProvider`; reversed, the keyboard silently stops working.

## Boundaries

- A component can be registered once. Re-registering throws: `[Ink-Cartridge] Component "xxx" is already registered. Duplicate registration is not allowed.`
- `parent` must be registered first, otherwise: `Register the parent first with registerComponent(...)`.
- Every component without a parent is a root; several independent trees can coexist.
- `template` is a default, not current state. Navigation `params` override its fields; the template itself is never modified.
- `clearRegistry()` empties the registry, mainly for test isolation.
