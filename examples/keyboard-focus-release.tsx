import { Box, render, Text } from "ink";
import React, { useEffect, useState } from "react";
import {
  CurrentScreen,
  KeyboardProvider,
  registerComponent,
  ScenarioManagementProvider,
  useFocusState,
  useKeyboard,
} from "../src/index.js";

const ITEMS = ["alpha", "beta", "gamma"];

// Reports the active focus id of a group — `null` when the group has none,
// which is what `releaseFocusWhenEmpty` produces once its last target goes.
function useActiveFocus(group?: string): string | null {
  const { focusCurrent, subscribeFocus } = useKeyboard();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setId(focusCurrent(group).result?.id ?? null);
    sync();
    return subscribeFocus(sync);
  }, [focusCurrent, subscribeFocus, group]);

  return id;
}

function List() {
  const { boundKeyboard } = useKeyboard();
  const [cursor, setCursor] = useState(0);
  const focused = useFocusState("list");

  useEffect(() => {
    const unDown = boundKeyboard(
      ["j"],
      () => {
        setCursor((n) => (n + 1) % ITEMS.length);
      },
      { focusId: "list" },
    );
    const unUp = boundKeyboard(
      ["k"],
      () => {
        setCursor((n) => (n - 1 + ITEMS.length) % ITEMS.length);
      },
      { focusId: "list" },
    );
    return () => {
      unDown();
      unUp();
    };
  }, [boundKeyboard]);

  return (
    <Box flexDirection="column" width={22}>
      <Text bold color={focused ? "cyan" : undefined}>
        list
      </Text>
      {ITEMS.map((item, i) => (
        <Text key={item} inverse={i === cursor}>
          {i === cursor ? ">" : " "} {item}
        </Text>
      ))}
      <Text dimColor>j / k</Text>
    </Box>
  );
}

// Each field is the only holder of its focus target: unmounting it releases
// the target, mounting it again takes the group's focus back.
function Field({ id, label }: { id: string; label: string }) {
  const { boundKeyboard } = useKeyboard();
  const [typed, setTyped] = useState(0);
  const focused = useFocusState(id, "form");

  useEffect(() => {
    const unbind = boundKeyboard(
      ["i"],
      () => setTyped((n) => n + 1),
      { focusId: { group: "form", focusId: id } },
    );
    return unbind;
  }, [id, boundKeyboard]);

  return (
    <Text color={focused ? "green" : undefined}>
      {focused ? ">" : " "} {label}
      {typed ? `  · i x${typed}` : ""}
    </Text>
  );
}

function Demo() {
  const { boundKeyboard, focusNext } = useKeyboard();
  const [showName, setShowName] = useState(true);
  const [showEmail, setShowEmail] = useState(true);
  const listFocus = useActiveFocus();
  const formFocus = useActiveFocus("form");

  useEffect(() => {
    const unbindName = boundKeyboard(["n"], () => setShowName((v) => !v));
    const unbindEmail = boundKeyboard(["e"], () => setShowEmail((v) => !v));
    const unbindCycle = boundKeyboard(["tab"], () => {
      focusNext("form");
    });
    const unbindQuit = boundKeyboard(["q"], () => process.exit(0));
    return () => {
      unbindName();
      unbindEmail();
      unbindCycle();
      unbindQuit();
    };
  }, [boundKeyboard, focusNext]);

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold underline>
        releaseFocusWhenEmpty demo
      </Text>
      <Text dimColor>
        A focus target goes away once nothing binds to it; the next one to
        register takes its group's focus back.
      </Text>

      <Box marginTop={1} gap={4}>
        <List />
        <Box flexDirection="column" width={28}>
          <Text bold>form group</Text>
          {showName ? (
            <Field id="name" label="name" />
          ) : (
            <Text dimColor> name (unmounted)</Text>
          )}
          {showEmail ? (
            <Field id="email" label="email" />
          ) : (
            <Text dimColor> email (unmounted)</Text>
          )}
          <Text dimColor>n / e toggle · i type · tab cycle</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text>focusCurrent() → {listFocus ?? "— (group released)"}</Text>
        <Text>
          focusCurrent("form") → {formFocus ?? "— (group released)"}
        </Text>
      </Box>

      <Text dimColor>q: quit</Text>
    </Box>
  );
}

registerComponent(Demo, {});

render(
  <ScenarioManagementProvider defaultScreen={Demo}>
    {/* The option under test: without it, an emptied target stays registered. */}
    <KeyboardProvider releaseFocusWhenEmpty>
      <CurrentScreen />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
