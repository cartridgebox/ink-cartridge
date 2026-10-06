/**
 * Runtime validation utilities for stream objects and dependencies.
 *
 * Provides defense-in-depth against type confusion attacks, malformed objects,
 * and compromised dependencies by validating object shapes at runtime.
 */

/**
 * Validates that an object has all required methods.
 *
 * Performs runtime validation to ensure type safety and prevent crashes from
 * malformed or malicious objects. This is defense-in-depth against type confusion
 * attacks and runtime errors.
 *
 * @param obj - The unknown object to validate
 * @param requiredMethods - Array of method names that must exist and be functions
 * @param objName - Name of the object for error messages
 * @throws {TypeError} If obj is not an object, is null, or missing required methods
 *
 * @example
 * ```ts
 * validateStream(inputStream, ['on', 'off', 'pause', 'resume'], 'inputStream');
 * // Throws if inputStream is missing any of these methods
 * ```
 */
export function validateStream(
  obj: unknown,
  requiredMethods: string[],
  objName: string,
): asserts obj is Record<string, unknown> {
  if (typeof obj !== 'object' || obj === null) {
    throw new TypeError(
      `[ink-cartridge] ${objName} must be an object, got ${typeof obj === 'object' ? 'null' : typeof obj}`,
    );
  }

  for (const method of requiredMethods) {
    const value = (obj as Record<string, unknown>)[method];

    if (typeof value !== 'function') {
      throw new TypeError(
        `[ink-cartridge] ${objName} must have method ${method}(), but ${typeof value === 'undefined' ? 'it is missing' : `it has type ${typeof value}`}`,
      );
    }
  }
}

/**
 * Validates that a value is a function.
 *
 * @param fn - The unknown value to validate
 * @param fnName - Name of the function parameter for error messages
 * @throws {TypeError} If fn is not a function
 *
 * @example
 * ```ts
 * validateFunction(handleEvent, 'handleEvent');
 * // Throws if handleEvent is not a function
 * ```
 */
export function validateFunction(fn: unknown, fnName: string): asserts fn is (...args: unknown[]) => unknown {
  if (typeof fn !== 'function') {
    throw new TypeError(`[ink-cartridge] ${fnName} must be a function, got ${typeof fn}`);
  }
}

/**
 * Validates that a value is a writable stream with a write method.
 *
 * @param stream - The unknown stream to validate
 * @param streamName - Name of the stream for error messages
 * @throws {TypeError} If stream doesn't have a write method
 *
 * @example
 * ```ts
 * validateWritableStream(outputStream, 'outputStream');
 * // Throws if outputStream.write is not a function
 * ```
 */
export function validateWritableStream(stream: unknown, streamName: string): void {
  validateStream(stream, ['write'], streamName);
}

/**
 * Validates that a value is a readable stream with required event emitter methods.
 *
 * @param stream - The unknown stream to validate
 * @param streamName - Name of the stream for error messages
 * @throws {TypeError} If stream doesn't have required methods
 *
 * @example
 * ```ts
 * validateReadableStream(inputStream, 'inputStream');
 * // Throws if inputStream is missing on/off/pause/resume methods
 * ```
 */
export function validateReadableStream(stream: unknown, streamName: string): void {
  validateStream(stream, ['on', 'off', 'pause', 'resume'], streamName);
}
