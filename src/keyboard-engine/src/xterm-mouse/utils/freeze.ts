/**
 * Deep freeze utilities for runtime immutability with TypeScript type safety
 *
 * Provides recursive freezing with type-level readonly guarantees that match
 * runtime behavior. Prevents object tampering and prototype pollution attacks.
 *
 * @module utils/freeze
 */

/**
 * Primitive types that don't need freezing
 */
type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * Built-in objects that have their own freezing semantics
 */
// Function type is appropriate for generic built-in check
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type Builtin = Primitive | Function | Date | RegExp | Error | File | Blob | URL;

/**
 * Recursively makes all properties readonly, matching runtime deepFreeze behavior
 *
 * This type transforms:
 * - Objects: `{ readonly [P in keyof T]: DeepReadonly<T[P]> }`
 * - Arrays: `ReadonlyArray<DeepReadonly<U>>`
 * - Maps: `ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>`
 * - Sets: `ReadonlySet<DeepReadonly<U>>`
 * - WeakMaps/WeakSets: Unchanged (cannot be frozen deeply)
 * - Primitives/Builtins: Unchanged
 *
 * @example
 * ```ts
 * type Config = {
 *   user: { name: string; meta: { age: number } };
 *   tags: string[];
 *   flags: Set<string>;
 * };
 *
 * const frozen: DeepReadonly<Config> = deepFreeze(config);
 * frozen.user.name = "Bob"; // ❌ TypeScript error
 * frozen.tags.push("go");  // ❌ TypeScript error
 * ```
 */
export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends Set<infer M>
      ? ReadonlySet<DeepReadonly<M>>
      : T extends WeakMap<infer WK, infer WV>
        ? WeakMap<DeepReadonly<WK>, DeepReadonly<WV>>
        : T extends WeakSet<infer WM>
          ? WeakSet<DeepReadonly<WM>>
          : T extends ReadonlyArray<infer U>
            ? readonly DeepReadonly<U>[]
            : T extends Array<infer U>
              ? readonly DeepReadonly<U>[]
              : T extends object
                ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
                : T;

/**
 * Recursively freezes an object and all its nested properties
 *
 * Freezes objects recursively to prevent any modifications at runtime.
 * Handles built-in objects (Date, RegExp, Error, etc.) specially.
 * Prevents infinite loops with circular references using WeakSet.
 *
 * `Object.freeze` cannot seal a Set's or Map's internal slots, so `add`/`set`
 * keep working even on a frozen collection — only its entries are frozen.
 *
 * @param obj - The object to freeze
 * @param seen - Internal WeakSet to track already-seen objects (prevent infinite loops)
 * @returns The same object with all nested properties frozen
 *
 * @example
 * ```ts
 * const config = {
 *   user: { name: "Max", meta: { age: 30 } },
 *   tags: ["ts", "rust"],
 *   flags: new Set(["a", "b"]),
 *   map: new Map([["feature", { enabled: true }]]),
 * };
 *
 * const frozen = deepFreeze(config);
 *
 * frozen.user.name = "Bob";                 // ❌ Runtime error: Cannot assign to read only property
 * frozen.tags.push("go");                   // ❌ Runtime error: Cannot add property to frozen array
 * frozen.map.get("feature")!.enabled = false; // ❌ Runtime error: entries are frozen too
 * frozen.flags.add("c");                    // ⚠️ Succeeds: freeze does not seal a Set
 * ```
 */
export function deepFreeze<T>(obj: T, seen: WeakSet<object> = new WeakSet<object>()): DeepReadonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj as DeepReadonly<T>;
  }

  if (seen.has(obj as object)) {
    return obj as DeepReadonly<T>;
  }
  seen.add(obj as object);

  // Built-in objects have their own semantics - just freeze at top level
  const builtins = [Date, RegExp, Error, URL, File, Blob] as const;
  if (builtins.some((ctor) => obj instanceof ctor)) {
    return Object.freeze(obj) as DeepReadonly<T>;
  }

  if (obj instanceof Map) {
    // Entries are `unknown` here — recursive freeze must walk arbitrary
    // keys/values, so the assertions are intentional.
    for (const [k, v] of obj.entries()) {
      deepFreeze(k as any, seen);
      deepFreeze(v as any, seen);
    }
    return Object.freeze(obj) as DeepReadonly<T>;
  }

  if (obj instanceof Set) {
    // Same as Map: entries are arbitrary values.
    for (const v of obj.values()) {
      deepFreeze(v as any, seen);
    }
    return Object.freeze(obj) as DeepReadonly<T>;
  }

  // WeakMap/WeakSet can only freeze top-level (cannot iterate entries)
  if (obj instanceof WeakMap || obj instanceof WeakSet) {
    return Object.freeze(obj) as DeepReadonly<T>;
  }

  const propNames = Object.getOwnPropertyNames(obj);
  for (const name of propNames) {
    // Arbitrary property access for the recursive walk.
    const value = (obj as any)[name];
    deepFreeze(value, seen);
  }

  return Object.freeze(obj) as DeepReadonly<T>;
}

/**
 * Freezes an object only in development mode
 *
 * In production, returns the object unchanged for performance.
 * Useful for adding safety during development without production overhead.
 *
 * @param obj - The object to conditionally freeze
 * @returns The frozen object (dev) or original object (prod)
 *
 * @example
 * ```ts
 * const config = { user: { name: "Max" } };
 * const frozen = freezeIfDev(config);
 *
 * if (process.env.NODE_ENV === 'development') {
 *   frozen.user.name = "Bob"; // ❌ Runtime error in dev
 * }
 * // In production, this would work (no freezing)
 * ```
 */
export function freezeIfDev<T>(obj: T): T {
  if (process.env.NODE_ENV === 'development') {
    return deepFreeze(obj) as T;
  }
  return obj;
}

/**
 * Freeze an object at runtime, matching the value-level immutability that
 * `strict` TypeScript mode is meant to guarantee.
 *
 * The freeze is unconditional — a tsconfig setting cannot be read at runtime
 * — and the return type stays `T`, so this adds no compile-time protection;
 * use {@link deepFreeze} when the `DeepReadonly` type is wanted as well.
 *
 * @param obj - The object to freeze
 * @returns The same object with its nested properties frozen
 *
 * @example
 * ```ts
 * const config = { user: { name: "Max" } };
 * const frozen = freezeInStrictMode(config);
 * frozen.user.name = "Bob"; // ❌ Runtime error (the type still allows it)
 * ```
 */
export function freezeInStrictMode<T>(obj: T): T {
  return deepFreeze(obj) as T;
}

/**
 * Checks if an object is frozen (either by Object.freeze or deepFreeze)
 *
 * @param obj - The object to check
 * @returns true if the object is frozen, false otherwise
 *
 * @example
 * ```ts
 * const obj = { data: [1, 2, 3] };
 * const frozen = deepFreeze(obj); // returns the same reference
 *
 * isFrozen(obj); // true — deepFreeze froze this very object
 * isFrozen({});  // false
 * ```
 */
export function isFrozen(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object') {
    return true; // Primitives are immutable
  }

  return Object.isFrozen(obj as object);
}
