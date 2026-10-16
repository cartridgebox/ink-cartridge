import { Box, render, Text, useWindowSize } from "ink";
import React, { useContext, useEffect, useState } from "react";
import {
  CurrentScreen,
  KeyboardProvider,
  LayerElementContext,
  registerComponent,
  ScenarioManagementProvider,
  useKeyboard,
  useScreenSystem,
} from "../../src/index.js";

// Fixed dimensions keep the centering math for the floating layer consistent.
const OVERLAY_W = 42;
const OVERLAY_H = 8;

function Main() {
  const { skip, openLayer, applyElement } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const [pageZ, setPageZ] = useState(0);

  useEffect(() => {
    const unbindZ = boundKeyboard(["z"], () => setPageZ((n) => n + 1));
    const unbindOpen = boundKeyboard(["a"], () => {
      openLayer("scoped-layer", 10, {
        crossPage: true,
        // The takeover only applies on the listed pages: the layer's
        // bindings go dormant on Combat and stay active everywhere else.
        automaticTakeoverKeyboard: [Combat],
      });
      applyElement("scoped-layer", {
        element: Layer,
        elementId: "scoped-el",
      });
    });
    const unbindSkip = boundKeyboard(["s"], () => skip(Game, {}));
    return () => {
      unbindZ();
      unbindOpen();
      unbindSkip();
    };
  }, []);

  return (
    <Box height="100%" width="100%" flexDirection="column">
      <Text bold color="green">
        The Main Page — host page of the scoped layer
      </Text>
      <Text>page z count: {pageZ}</Text>
      <Text color="cyan">layer: ACTIVE here (host page)</Text>
      <Text dimColor>a: open scoped layer    s: go to Game    z: press me</Text>
    </Box>
  );
}

registerComponent(Main, {});

function Game() {
  const { back, skip } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const [pageZ, setPageZ] = useState(0);

  useEffect(() => {
    const unbindZ = boundKeyboard(["z"], () => setPageZ((n) => n + 1));
    const unbindCombat = boundKeyboard(["k"], () => skip(Combat, {}));
    const unbindBack = boundKeyboard(["b"], () => back());
    return () => {
      unbindZ();
      unbindCombat();
      unbindBack();
    };
  }, []);

  return (
    <Box height="100%" width="100%" flexDirection="column">
      <Text bold color="green">The Game Page</Text>
      <Text>page z count: {pageZ}</Text>
      <Text color="cyan">layer: ACTIVE here (Game is not listed)</Text>
      <Text dimColor>k: go to Combat    b: back    z: press me</Text>
    </Box>
  );
}

registerComponent(Game, {}, { parent: Main });

function Combat() {
  const { back } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const [pageZ, setPageZ] = useState(0);

  useEffect(() => {
    const unbindZ = boundKeyboard(["z"], () => setPageZ((n) => n + 1));
    const unbindBack = boundKeyboard(["b"], () => back());
    return () => {
      unbindZ();
      unbindBack();
    };
  }, []);

  return (
    <Box height="100%" width="100%" flexDirection="column">
      <Text bold color="green">The Combat Page</Text>
      <Text>page z count: {pageZ}</Text>
      <Text color="red">layer: DORMANT here (Combat is listed)</Text>
      <Text dimColor>b: back    z: falls through to this page</Text>
    </Box>
  );
}

registerComponent(Combat, {}, { parent: Game });

function Layer({
  top: topProp,
  left: leftProp,
}: {
  top?: number;
  left?: number;
}) {
  const context = useContext(LayerElementContext);
  const { closeLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();
  const [layerZ, setLayerZ] = useState(0);
  const { columns, rows } = useWindowSize();
  const top = topProp ?? Math.max(0, Math.floor((rows - OVERLAY_H) / 2));
  const left = leftProp ?? Math.max(0, Math.floor((columns - OVERLAY_W) / 2));

  useEffect(() => {
    const unbindZ = boundKeyboard(["z"], () => setLayerZ((n) => n + 1));
    const unbindClose = boundKeyboard(["escape"], () => {
      if (context?.layer) {
        closeLayer(context.layer.layerId);
      }
    });
    return () => {
      unbindZ();
      unbindClose();
    };
  }, []);

  return (
    <Box
      position="absolute"
      top={top}
      left={left}
      width={OVERLAY_W}
      height={OVERLAY_H}
      borderStyle="bold"
      borderColor="yellow"
      backgroundColor="black"
      flexDirection="column"
    >
      <Text bold color="yellow">Scoped Layer</Text>
      <Text>layer z count: {layerZ}</Text>
      <Text dimColor>automaticTakeoverKeyboard: [Combat]</Text>
      <Text dimColor>esc: close</Text>
    </Box>
  );
}

registerComponent(Layer, {});

render(
  <ScenarioManagementProvider defaultScreen={Main} fullScreen>
    <KeyboardProvider>
      <CurrentScreen />
    </KeyboardProvider>
  </ScenarioManagementProvider>,
);
