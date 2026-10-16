import { Box, render, Text } from "ink";
import React, { useContext, useEffect } from "react";
import {
  CurrentScreen,
  KeyboardProvider,
  LayerElementContext,
  registerComponent,
  ScenarioManagementProvider,
  useKeyboard,
  useScreenSystem,
} from "../../src/index.js";

function Main() {
  const { skip, openLayer, applyElement } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    const unBinds: (() => void)[] = [];

    unBinds.push(boundKeyboard(["s"], () => skip(Game, {})));

    unBinds.push(
      boundKeyboard(["o"], () => {
        openLayer("layer", 1, {
          crossPage: true,
          automaticTakeoverKeyboard: true,
        });
        applyElement("layer", {
          element: Layer,
          elementId: "element",
        });
      }),
    );

    return () => {
      unBinds.forEach((each) => each());
    };
  }, []);

  return (
    <Box height="100%" width="100%">
      <Text>The Main Page</Text>
    </Box>
  );
}

registerComponent(Main, {});

function Game() {
  const { back } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    return boundKeyboard(["b"], () => back());
  }, []);

  return (
    <Box height="100%" width="100%">
      <Text>The Game Page</Text>
    </Box>
  );
}

registerComponent(
  Game,
  {},
  {
    parent: Main,
  },
);

function Layer() {
  const context = useContext(LayerElementContext);
  const { closeLayer } = useScreenSystem();
  const { boundKeyboard } = useKeyboard();

  useEffect(() => {
    return boundKeyboard(["escape"], () => {
      if (context?.layer) {
        closeLayer(context.layer.layerId);
      }
    });
  }, []);

  return (
    <Box height="100%" width="100%" justifyContent="center" alignItems="center">
      <Box
        borderStyle="bold"
        borderColor="yellow"
        backgroundColor="black"
        height={10}
        width={10}
        justifyContent="center"
        alignItems="center"
      >
        <Text>The Layer</Text>
      </Box>
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
