import type { GlobalKeyEntry } from "./types/entry.js";
import type { PageKeyboardLayer } from "./types/page-layer.js";

/**
 * Check whether a global key entry should fire for the current event.
 *
 * Evaluates key-name matching, category whitelist, and screen-level
 * global-key override (cover mechanism).
 *
 * @param entry        The global key entry to evaluate.
 * @param eventNames   Normalized key names from the current event.
 * @param topComponent The topmost screen component, or null.
 * @param layersRef    Map of all page keyboard layers.
 * @returns true if the global key matches and is not overridden.
 *
 * @example
 * ```ts
 * // Inside a custom processor:
 * for (const entry of resolvedGlobalKeys) {
 *   if (checkGlobalKey(entry, eventNames, ctx.topComponent, ctx.layersRef)) {
 *     entry.operate();
 *     return true;
 *   }
 * }
 * ```
 */
export function checkGlobalKey(
  entry: GlobalKeyEntry,
  eventNames: string[],
  topComponent: unknown | null,
  layersRef: Map<unknown | string, PageKeyboardLayer>,
): boolean {
  const keyNames = Array.isArray(entry.key) ? entry.key : [entry.key];
  if (!keyNames.some((k) => eventNames.includes(k))) return false;
  if (!topComponent) return false;

  const cat = entry.category;
  if (cat === undefined || cat === '*') {
    // Pass — matches all categories, no filtering needed.
  } else if (Array.isArray(cat) && cat.length === 0) {
    return false;
  } else if (Array.isArray(cat)) {
    if (!cat.includes(topComponent)) return false;
  }

  const topLayer = layersRef.get(topComponent);

  // affectLayer × cover: [true,true] layer-scoped, overridable by layer
  // elements; [true,false] layer-scoped, not overridable; [false,true]
  // page-scoped, overridable by the page; [false,false] page-scoped, not
  // overridable. Only the page-stack case is checked here; the layer-phase
  // quadrants are enforced earlier by the global-key processor.
  if (topLayer && !entry.affectLayer && (entry.cover ?? true)) {
    if (keyNames.some((k) => topLayer.globalKeyOverrides.has(k))) return false;
  }

  return true;
}
