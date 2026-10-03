# Organizing screens with `registerComponent`

ink-cartridge organizes your app with a **screen tree**: every screen has exactly one parent but can have many children. You switch between screens with methods such as `skip` and `gotoScreen` (this chapter only covers how to register screens into the tree — navigation is covered in the "Screen Navigation" chapter).

This chapter covers one of ink-cartridge's most core methods: `registerComponent`.

## The screen tree: parent and children

In ink-cartridge, **every React component can be a screen**. The relationships between screens are declared by you — the `parent` option of `registerComponent` decides "who is this screen's parent".

For example, the following tree:

```
Main Menu
├── Settings
└── About
```

- `Main Menu` has no parent — it is a **root screen**;
- `Settings` and `About` both have `Main Menu` as their parent;
- navigation only moves between parents and children, or along the tree (`skip` down, `back` up, `gotoScreen` across branches).

## Prerequisites

| Chapter | Why you need it |
|---|---|
| [Quick Start](/quick-start-1) | The screen tree and the overall provider structure are set up here |

After screens are registered into the tree, they still need to be actually rendered, which is done by two components working together:

- **`ScenarioManagementProvider`** — the context provider of the screen system, wrapping the whole app: it maintains the screen tree state (current path, layers, modal layers, etc.). `defaultScreen` specifies the initial screen at startup (must be a registered component, otherwise it throws), and `fullScreen` makes the screen fill the terminal height.
- **`CurrentScreen`** — reads the provider's state and renders the **currently active screen**. The provider itself renders nothing — the two must be used together.

```tsx
<ScenarioManagementProvider defaultScreen={Home} fullScreen>
  <CurrentScreen />
</ScenarioManagementProvider>
```

> If you need the keyboard system, `KeyboardProvider` must be nested inside `ScenarioManagementProvider`, otherwise keyboard bindings will not work.

This is only a brief introduction — their full details will be covered in a **later article**.

## Registering your first screen

Registering a screen takes one line of code:

```tsx
import React from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  ScenarioManagementProvider,
  registerComponent,
} from 'ink-cartridge';

function Home() {
  return (
    <Box flexDirection="column">
      <Text bold>🏠 Home</Text>
    </Box>
  );
}

// Register Home as a screen: no parent declared, so it is a root screen
// `Home` takes no props, so the template can be omitted (defaults to {})
registerComponent(Home);
```

`registerComponent` is a module-level function — you can call it anywhere in a `.ts` or `.tsx` file (usually right after the component definition).

After registering, point `ScenarioManagementProvider` at the default screen and render:

```tsx
render(
  <ScenarioManagementProvider defaultScreen={Home} fullScreen>
    <CurrentScreen />
  </ScenarioManagementProvider>
);
```

The terminal will show `🏠 Home`. Here:

- `component` (first argument): which component is the screen. **The component itself acts as the unique registration key** — the same component can only be registered once.
- `template` (second argument, optional): the initial template, used as the screen's **default props**. Props passed during navigation are merged with it. `Home` needs no props, so it can be omitted (defaults to `{}`).

## Building a branching tree

Let's register a "Main Menu → Settings / About" tree to demonstrate **one parent, many children**:

```tsx
import React from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  ScenarioManagementProvider,
  registerComponent,
} from 'ink-cartridge';

function MainMenu() {
  return (
    <Box flexDirection="column">
      <Text bold>🏠 Main Menu</Text>
      <Text>Settings and About are my child screens</Text>
    </Box>
  );
}
registerComponent(MainMenu, {});

function Settings() {
  return <Text>⚙️ Settings</Text>;
}
// parent points to MainMenu: Settings becomes a child screen of MainMenu
registerComponent(Settings, {}, { parent: MainMenu });

function About() {
  return <Text>ℹ️ About</Text>;
}
// About hangs under MainMenu as well
registerComponent(About, {}, { parent: MainMenu });

render(
  <ScenarioManagementProvider defaultScreen={MainMenu} fullScreen>
    <CurrentScreen />
  </ScenarioManagementProvider>
);
```

Once registered, the screen tree looks like this:

```
MainMenu (root screen)
├── Settings
└── About
```

Note the registration order: **register the parent screen first, then the children**. If `parent` is not registered yet, `registerComponent` throws right away (see caveat #2 below).

## API reference

The function signature of `registerComponent`:

```typescript
function registerComponent<C extends React.ComponentType<any>>(
  component: C,
  template?: React.ComponentProps<C>,
  options?: RegisterOptions,
): void
```

- `component` {React.ComponentType&lt;any&gt;} The React component registered as a screen; also serves as the unique registration key.
- `[template]` {React.ComponentProps&lt;C&gt;} The initial template, i.e. the screen's default props; merged with props passed during navigation. **Default:** `{}`.
- `[options]` {RegisterOptions}
  - `[parent]` {React.ComponentType&lt;any&gt;} The parent screen component; when omitted, the screen is a root screen (candidate).

The full definition of `RegisterOptions`:

```typescript
interface RegisterOptions {
    parent?: ComponentType<any> | undefined;
}
```

## Caveats

1. **A component can only be registered once.** Calling `registerComponent` again throws: `[Ink-Cartridge] Component "xxx" is already registered. Duplicate registration is not allowed.` (Avoid duplicate registration in hot-reload or loop scenarios.)
2. **`parent` must be registered first.** When you declare a `parent`, that component must already be registered, otherwise it throws and tells you to register the parent first: `Register the parent first with registerComponent(...)`.
3. **No `parent` means a root screen.** A root screen has no parent node and is usually passed to `ScenarioManagementProvider` as `defaultScreen`, serving as the app's default page and home page.
4. **There can be multiple root screens.** Every component without a `parent` is the root of its own independent tree; they don't affect each other and each has its own subtree.
5. **`template` is default props, not "current values".** It only describes the default attributes used when the screen is created; props passed during navigation are merged with it, and `template` itself is never modified. It is optional — omitting it is equivalent to passing `{}`.
