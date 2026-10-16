/**
 * gotoScreen Demo — refreshing a screen that is already on the path.
 *
 * `gotoScreen` to a screen that is already on the current path (the current
 * screen or one of its ancestors) takes the new params in place of the old
 * ones. By default the target is remounted with them, so its internal state
 * resets; `{ onlyAttribute: true }` updates only its props and keeps the
 * mounted instance.
 *
 * Counter counts the `i` presses since it mounted, so the two modes show up
 * side by side: refresh with `g` and the count drops back to 0, refresh with
 * `o` and it survives.
 *
 * Controls:
 *   c — skip to Counter
 *   i — count one more press (Counter's own state)
 *   g — gotoScreen(Counter, new label)                       — remount, count resets
 *   o — gotoScreen(Counter, new label, { onlyAttribute })    — count survives
 *   h — gotoScreen(Home, new title)   — ancestor jump: params applied, Counter dropped
 *   b — back
 *   q — quit
 *
 * Run:
 *   npx tsx examples/core/goto-screen.tsx
 */
import React, { useEffect, useState } from 'react';
import { Box, Text, render } from 'ink';
import {
  CurrentScreen,
  KeyboardProvider,
  registerComponent,
  ScenarioManagementProvider,
  useKeyboard,
  useScreenSystem,
} from '../../src/index.js';

// Module-level, so every refresh gets a new label. A sequence kept inside
// Counter would be reset by the very remount it is meant to make visible.
let refreshSeq = 0;
const nextLabel = (mode: string) => `${mode} #${++refreshSeq}`;

function Home({ title }: { title: string }) {
  const { skip } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    const unbindEnter = boundKeyboard(['c'], () => {
      skip(Counter, { label: nextLabel('first visit') });
    });
    const unbindQuit = boundKeyboard(['q'], () => process.exit(0));
    return () => {
      unbindEnter();
      unbindQuit();
    };
  }, [boundKeyboard, skip]);

  return (
    <Box height="100%" width="100%" flexDirection="column">
      <Text bold color="green">{title}</Text>
      <Text dimColor>
        gotoScreen keeps a screen's params up to date even when it is already
        on the path.
      </Text>
      <Text>c: go to Counter</Text>
      <Text dimColor>q: quit</Text>
    </Box>
  );
}

registerComponent(Home, { title: 'Home' });

function Counter({ label }: { label: string }) {
  const { back, gotoScreen } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const [count, setCount] = useState(0);

  useEffect(() => {
    const unbindCount = boundKeyboard(['i'], () => setCount((n) => n + 1));
    const unbindRemount = boundKeyboard(['g'], () => {
      gotoScreen(Counter, { label: nextLabel('goto default') });
    });
    const unbindKeep = boundKeyboard(['o'], () => {
      gotoScreen(
        Counter,
        { label: nextLabel('goto onlyAttribute') },
        { onlyAttribute: true },
      );
    });
    const unbindHome = boundKeyboard(['h'], () => {
      gotoScreen(Home, { title: nextLabel('Home via gotoScreen') });
    });
    const unbindBack = boundKeyboard(['b'], () => back());
    const unbindQuit = boundKeyboard(['q'], () => process.exit(0));
    return () => {
      unbindCount();
      unbindRemount();
      unbindKeep();
      unbindHome();
      unbindBack();
      unbindQuit();
    };
  }, [back, boundKeyboard, gotoScreen]);

  return (
    <Box height="100%" width="100%" flexDirection="column">
      <Text bold color="green">Counter</Text>
      <Text>label: {label}</Text>
      <Text>count: {count}</Text>
      <Text dimColor>i: count + 1</Text>
      <Text dimColor>g: gotoScreen(Counter, new label) — remounts, count resets</Text>
      <Text dimColor>o: gotoScreen(Counter, new label, onlyAttribute) — count survives</Text>
      <Text dimColor>h: gotoScreen(Home, new title) — ancestor jump</Text>
      <Text dimColor>b: back    q: quit</Text>
    </Box>
  );
}

registerComponent(Counter, { label: 'initial' }, { parent: Home });

render(
  <ScenarioManagementProvider defaultScreen={Home} fullScreen>
    <KeyboardProvider>
      <CurrentScreen />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
