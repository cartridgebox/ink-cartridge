# Core concepts

A one-page map: ink-cartridge has three parts — the screen system, the keyboard engine, and the React adapter. Building this overall picture first makes the later chapters much easier.

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Quick Start](/quick-start-1) | Get it running first, then read the structure |

## The three parts

| Part | Responsibility | Entry point |
|---|---|---|
| Screen system | Screen tree and stack, layers, modal layers, navigation | `registerComponent` / `useScreenSystem` |
| Keyboard engine | The whole path from a key press to a matched binding (nine-stage pipeline) | `KeyboardEngine` |
| React adapter | Wires both into React | `ScenarioManagementProvider` / `KeyboardProvider` |

## Screen tree and stack

`registerComponent(Component, template, { parent })` builds a screen tree; the active one is a stack from root to leaf, whose top is the screen `CurrentScreen` renders. `skip` / `back` / `gotoScreen` navigate within it. See [Organize Your Screen](/screen/screen-registry) and [Navigation](/screen/navigation).

## Layers and modal layers

Layers float above the screen; modal layers float above the layers and, by default, take over the keyboard exclusively. Both are opened / closed through `useScreenSystem`. See [Layer Basics](/screen/layer-base) and [Modal Layer Basics](/screen/modal-layer-base).

## The keyboard pipeline

A key press travels from the device to a matched binding through a nine-stage pipeline:

Modal → overlay phase (composition / global sequences / global keys) → layer broadcast → screen phase (composition / global sequences / global keys) → screen stack

The first stage that consumes the event ends propagation. See [Custom Processors](/keyboard/processors).

## Ownership

Every binding carries an owner (the current screen or layer element); a key is matched only while that owner is active. See [Binding Attribution & the Owner Stack](/screen/binding-attribution).

## Provider nesting

`KeyboardProvider` must sit inside `ScenarioManagementProvider`. Reversed, the keyboard **silently stops working**.
