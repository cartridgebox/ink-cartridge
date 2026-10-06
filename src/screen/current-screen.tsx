import React from "react";
import { Box, useWindowSize } from "ink";
import { useScreenSystem } from "./hook.js";
import { ModalLayerElementContext } from "./ModalLayerElementContext.js";
import { LayerElementContext } from "./LayerElementContext.js";

/**
 * Render the current screen, overlays, and modals.
 *
 * Multiple overlays are rendered in zIndex order (ascending) so higher
 * zIndex overlays appear on top. Each overlay is wrapped in a
 * LayerElementContext.Provider so the keyboard system can isolate
 * per-overlay keyboard layers by overlay ID.
 *
 * Modals are rendered after overlays so they always appear visually on top.
 * Each modal is wrapped in a ModalLayerElementContext.Provider so the keyboard
 * system can isolate per-modal keyboard layers by modal ID.
 *
 * Architecturally symmetric between overlays and modals.
 *
 * @example
 * Render it as the leaf of the provider chain:
 * ```tsx
 * <ScenarioManagementProvider defaultScreen={MainScreen} fullScreen>
 *   <KeyboardProvider modes={['normal', 'insert']} mouse>
 *     <CurrentScreen />
 *   </KeyboardProvider>
 * </ScenarioManagementProvider>
 * ```
 */
export function CurrentScreen(): React.ReactNode {
  const { pageLayer, fullScreen, allLayers, allModalLayers } =
    useScreenSystem();
  const { rows } = useWindowSize();

  const layers = allLayers.map((layer) => {
    return (
      <Box
        key={layer.layerId}
        position="absolute"
        top={0}
        left={0}
        height="100%"
        width="100%"
      >
        {Array.from(layer.elements)
          .map((each) => each[1])
          .map((layerElement) => {
            const contextValue = {
              id: layerElement.elementId,
              layer: layer,
              hostPage: layer.hostPage,
              auto: layer.automaticTakeoverKeyboard,
              regionFocus: layer.regionFocus
            };

            return (
              <LayerElementContext.Provider
                value={contextValue}
                key={layerElement.elementId}
              >
                <layerElement.element {...layerElement.props} />
              </LayerElementContext.Provider>
            );
          })}
      </Box>
    );
  });

  const modals = allModalLayers.map((modalLayer) => {
    return (
      <Box
        key={modalLayer.layerId}
        position="absolute"
        top={0}
        left={0}
        height="100%"
        width="100%"
      >
        {Array.from(modalLayer.elements)
          .map((each) => each[1])
          .map((layerElement) => {
            const contextValue = {
              id: layerElement.elementId,
              modalLayer: modalLayer,
              hostPage: modalLayer.hostPage,
              auto: modalLayer.automaticTakeoverKeyboard,
              regionFocus: modalLayer.regionFocus
            };

            return (
              <ModalLayerElementContext.Provider
                value={contextValue}
                key={layerElement.elementId}
              >
                <layerElement.element {...layerElement.props} />
              </ModalLayerElementContext.Provider>
            );
          })}
      </Box>
    );
  });

  return (
    <Box
      flexDirection="column"
      width="100%"
      height={fullScreen ? rows : "100%"}
    >
      {pageLayer}
      {layers}
      {modals}
    </Box>
  );
}
