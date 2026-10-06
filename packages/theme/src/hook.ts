import { useContext } from 'react';
import { ThemeContext } from './context.js';
import type { ThemeContextValue } from './types.js';

/**
 * Access the theme API from within a component tree wrapped by
 * {@link ThemeProvider}.
 *
 * Returns `{ color, style, themeId, themes, setTheme, mergeTheme, addThemes }`.
 *
 * Must be used inside `<ThemeProvider>`. Throws with a clear error
 * message if no provider is found in the component tree.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error(
      '[ink-cartridge] useTheme() must be called inside a <ThemeProvider>.',
    );
  }
  return ctx;
}
