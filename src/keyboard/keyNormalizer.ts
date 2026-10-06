/**
 * Whether `key` is an object whose properties can be inspected. Both
 * adapters take `key: unknown` (the engine stays framework-agnostic and
 * passes through whatever the host framework provides), so junk input must
 * read as "no flags" instead of throwing on a property access.
 */
function isKeyDescriptor(key: unknown): key is Record<string, unknown> {
  return typeof key === 'object' && key !== null;
}

/**
 * Inspect an Ink `Key` descriptor and return `true` when the key is
 * NOT a normal character — i.e. it is an arrow key, navigation key,
 * modifier key, or release event.
 *
 * Used as the `isNormalChar` adapter for the keyboard-engine so it
 * stays framework-agnostic.
 */
export function isInkSpecialKey(key: unknown): boolean {
  if (!isKeyDescriptor(key)) return false;
  const k = key;
  if (k.upArrow || k.downArrow || k.leftArrow || k.rightArrow) return true;
  if (k.pageDown || k.pageUp || k.home || k.end) return true;
  if (k.return || k.escape || k.tab || k.backspace || k.delete) return true;
  if (k.ctrl || k.meta || k.super || k.hyper) return true;
  if (k.eventType === 'release') return true;
  return false;
}

/**
 * Convert Ink's `(input, key)` event into a list of possible key-name
 * strings for matching.
 *
 * When a modifier (ctrl, shift, meta) is held, the bare key name is
 * excluded so that modified keys (e.g. "shift+tab") do not accidentally
 * trigger bindings registered for the bare key alone (e.g. "tab").
 *
 * Examples:
 *   press('s', { ctrl: true })               → ["ctrl+s"]
 *   press('',  { escape: true })             → ["escape"]
 *   press('',  { return: true, shift: true }) → ["shift+return"]
 *   press('',  { tab: true })                → ["tab"]
 *   press('',  { tab: true, shift: true })   → ["shift+tab"]
 *
 * Junk `key` values (undefined, null) read as a descriptor with no flags, so
 * a plain character input still normalizes to its bare name.
 *
 * @param input - Raw character string from Ink's useInput (empty for special keys).
 * @param key   - Full Key descriptor from Ink.
 * @returns An ordered array of key-name strings.
 */
export function normalizeKeyNames(input: string, key: unknown): string[] {
  const k: Record<string, unknown> = isKeyDescriptor(key) ? key : {};
  const names: string[] = [];

  const hasCtrl = Boolean(k.ctrl);
  const hasShift = Boolean(k.shift);
  const hasMeta = Boolean(k.meta);
  const hasModifier = hasCtrl || hasShift || hasMeta;

  const specialMap: Array<[string, string]> = [
    ['return', 'return'],
    ['escape', 'escape'],
    ['backspace', 'backspace'],
    ['delete', 'delete'],
    ['upArrow', 'up'],
    ['downArrow', 'down'],
    ['leftArrow', 'left'],
    ['rightArrow', 'right'],
    ['tab', 'tab'],
    ['pageDown', 'pagedown'],
    ['pageUp', 'pageup'],
    ['home', 'home'],
    ['end', 'end'],
  ];

  for (const [kProp, kName] of specialMap) {
    if (!k[kProp]) {
      continue;
    }

    if (!hasModifier) {
      names.push(kName);
    }

    if (hasCtrl) {
      names.push(`ctrl+${kName}`);
    }
    if (hasShift) {
      names.push(`shift+${kName}`);
    }
    if (hasMeta) {
      names.push(`meta+${kName}`);
    }
    if (hasCtrl && hasShift) {
      names.push(`ctrl+shift+${kName}`);
    }

    return names;
  }

  if (input) {
    if (!hasModifier) {
      names.push(input);
    }

    if (hasCtrl) {
      names.push(`ctrl+${input}`);
    }
    if (hasShift) {
      names.push(`shift+${input}`);
    }
    if (hasMeta) {
      names.push(`meta+${input}`);
    }
    if (hasCtrl && hasShift) {
      names.push(`ctrl+shift+${input}`);
    }
  }

  return names;
}
