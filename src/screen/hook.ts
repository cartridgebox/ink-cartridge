import { useContext } from 'react';
import { ScreenSystemContext, ScreenSystemContextValue } from './context.js';

/**
 * Access the screen-management API from within a React component.
 *
 * Returns the full screen-management API: navigation (skip, back, gotoScreen),
 * layer management (openLayer, closeLayer, openModalLayer, closeModalLayer,
 * and their apply/erase/activate/deactivate/closeAll variants),
 * plus currentPath, allLayers, allModalLayers, pageLayer.
 *
 * Must be used inside a {@link ScenarioManagementProvider}.
 *
 * @throws If no provider is found in the component tree.
 */
export function useScreenSystem(): ScreenSystemContextValue {
  const ctx = useContext(ScreenSystemContext);
  if (!ctx) {
    throw new Error(
      '[ink-cartridge] useScreenSystem() must be called inside a <ScenarioManagementProvider>.',
    );
  }
  return ctx;
}
