# Core concepts

ink-cartridge has three parts: the screen system, the keyboard engine, and the React adapter. They share one attribution and state model.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Quick Start](/quick-start-1) | Get a minimal app running first |

## The three parts

| Part | Responsibility | Entry point |
|---|---|---|
| Screen system | Screen tree and stack, navigation, layers, modal layers, mouse-region attribution | `registerComponent` / `useScreenSystem` |
| Keyboard engine | Key normalization, the nine-stage pipeline, bindings and focus | `KeyboardEngine` |
| React adapter | Wires both into React and keeps rendering in sync | `ScenarioManagementProvider` / `KeyboardProvider` |

## Screen tree and stack

`registerComponent(Component, template, { parent })` builds the tree. The active state is a root-to-leaf path whose top is rendered by `CurrentScreen`. `skip` moves down, `back` moves up, and `gotoScreen` jumps across branches via the lowest common ancestor.

## Layers and modal layers

Layers are independent of the screen tree and float above the current screen; modal layers float above regular layers and take over the keyboard. Both stack by `zIndex`, which also decides visual, keyboard, and mouse priority. Cross-page retention and keyboard takeover are covered in [Cross-page layers and keyboard takeover](/screen/layer-cross-page-takeover).

## The keyboard pipeline

```text
modal → overlay phase (composition / global sequences / global keys)
      → layer broadcast
      → screen phase (composition / global sequences / global keys)
      → screen stack
```

The first stage that consumes the event stops propagation. Inside a layer events are broadcast; between layers a hit stops propagation. The modal stage runs first and installs a barrier.

## Attribution

Every binding belongs to the keyboard layer of its call site: a page, a layer element, or a modal-layer element. It matches only while that owner is active. The owner stack resolves attribution; see [Binding attribution and the owner stack](/screen/binding-attribution).

## Focus

Focus groups bindings into named targets within a layer, with at most one active target per group. Focus decides *which* target receives a key; attribution decides *where* the binding lives.

## Provider nesting

```tsx
<ScenarioManagementProvider defaultScreen={Home} fullScreen>
  <KeyboardProvider>
    <CurrentScreen />
  </KeyboardProvider>
</ScenarioManagementProvider>
```

`KeyboardProvider` must nest inside `ScenarioManagementProvider`; reversed, the keyboard silently stops working.
