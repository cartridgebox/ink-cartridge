import { ANSI_CODES } from '../parser/constants.js';
import type { ReadableStreamWithEncoding } from '../types/index.js';
import { MouseError } from '../types/index.js';
import { validateFunction, validateReadableStream, validateWritableStream } from '../utils/validation.js';

/**
 * FinalizationRegistry for automatic cleanup of TTY controllers.
 *
 * When a TTYController is garbage collected without explicit cleanup,
 * this registry ensures that:
 * - The stdin 'data' event listener is removed
 * - The input stream state is restored (raw mode disabled, stream paused)
 * - ANSI disable codes are sent to the terminal
 *
 * This prevents memory leaks from accumulated event listeners when controllers
 * are not properly destroyed.
 */
const ttyCleanupRegistry: FinalizationRegistry<{
  inputStream: ReadableStreamWithEncoding;
  handleEvent: (data: Buffer) => void;
  outputStream: NodeJS.WriteStream;
  previousRawMode: boolean | null;
  setRawModeFn?: (mode: boolean) => void;
}> = new FinalizationRegistry(
  (heldValue: {
    inputStream: ReadableStreamWithEncoding;
    handleEvent: (data: Buffer) => void;
    outputStream: NodeJS.WriteStream;
    previousRawMode: boolean | null;
    setRawModeFn?: (mode: boolean) => void;
  }) => {
    try {
      heldValue.inputStream.off('data', heldValue.handleEvent);
    } catch {
      // Ignore errors during GC cleanup
    }

    try {
      // Restore the mode from BEFORE enabling — not "off". A terminal that was
      // already raw must stay raw, and with a custom `setRawModeFn` the
      // stream's own `isRaw` never reflects the change anyway.
      if (heldValue.previousRawMode !== null) {
        if (heldValue.setRawModeFn) {
          heldValue.setRawModeFn(heldValue.previousRawMode);
        } else {
          heldValue.inputStream.setRawMode(heldValue.previousRawMode);
        }
      }
      heldValue.inputStream.pause();
    } catch {
      // Ignore errors during GC cleanup
    }

    try {
      heldValue.outputStream.write(
        ANSI_CODES.mouseSGR.off + ANSI_CODES.mouseMotion.off + ANSI_CODES.mouseDrag.off + ANSI_CODES.mouseButton.off,
      );
    } catch {
      // Ignore errors during GC cleanup
    }
  },
);

/**
 * TTYController manages terminal state for mouse event tracking.
 *
 * Responsibilities:
 * - Enable/disable terminal mouse mode via ANSI escape codes
 * - Manage input stream state (raw mode, encoding, pause/resume)
 * - Provide pause/resume for event throttling without terminal overhead
 * - Automatic cleanup via FinalizationRegistry
 */
export class TTYController {
  private enabled = false;
  private paused = false;
  private previousEncoding: BufferEncoding | null = null;
  private previousRawMode: boolean | null = null;
  private currentRawMode: boolean | null = null;
  private cleanupToken: { instance: TTYController } | null = null;

  /**
   * Creates a controller managing terminal state for mouse event tracking.
   * @param inputStream The readable stream to listen for mouse events on.
   * @param outputStream The writable stream to send ANSI control sequences to.
   * @param handleEvent Callback invoked with raw data chunks from the input stream.
   * @param setRawModeFn Custom function to set raw mode on the input stream.
   * @throws {TypeError} If any of the dependencies are malformed.
   */
  constructor(
    private inputStream: ReadableStreamWithEncoding,
    private outputStream: NodeJS.WriteStream,
    private handleEvent: (data: Buffer) => void,
    private setRawModeFn?: (mode: boolean) => void,
  ) {
    validateReadableStream(inputStream, 'inputStream');

    validateWritableStream(outputStream, 'outputStream');
    validateFunction(handleEvent, 'handleEvent');

    if (setRawModeFn !== undefined) {

      validateFunction(setRawModeFn, 'setRawModeFn');
    }
  }

  /**
   * Sets raw mode on the input stream using either the custom function
   * or the default stream.setRawMode method.
   */
  private setRawMode(mode: boolean): void {
    if (this.setRawModeFn) {
      this.setRawModeFn(mode);
    } else {
      this.inputStream.setRawMode(mode);
    }
  }

  /**
   * Enables mouse event tracking.
   *
   * This method activates mouse event capture by putting the input stream into raw mode
   * and sending the appropriate ANSI escape sequences to enable mouse tracking in the terminal.
   *
   * @throws {Error} If the input stream is not a TTY
   * @throws {MouseError} If enabling mouse tracking fails
   */
  public enable = (): void => {
    if (this.enabled) {
      return;
    }

    if (!this.inputStream.isTTY) {
      throw new Error('Mouse events require a TTY input stream');
    }

    try {
      this.previousRawMode = this.setRawModeFn ? (this.currentRawMode ?? false) : (this.inputStream.isRaw ?? false);
      this.previousEncoding = this.inputStream.readableEncoding || null;

      this.enabled = true;

      this.outputStream.write(
        ANSI_CODES.mouseButton.on + ANSI_CODES.mouseDrag.on + ANSI_CODES.mouseMotion.on + ANSI_CODES.mouseSGR.on,
      );

      this.setRawMode(true);
      this.currentRawMode = true;
      this.inputStream.setEncoding('utf8');
      this.inputStream.resume();
      this.inputStream.on('data', this.handleEvent);

      this.cleanupToken = { instance: this };
      ttyCleanupRegistry.register(
        this,
        {
          inputStream: this.inputStream,
          handleEvent: this.handleEvent,
          outputStream: this.outputStream,
          previousRawMode: this.previousRawMode,
          setRawModeFn: this.setRawModeFn,
        },
        this.cleanupToken,
      );
    } catch (err) {
      // Roll back what already took effect: the mouse-on codes are written and
      // raw mode may be on. `enabled` is still true here, so disable() runs the
      // full cleanup — its own failure must not mask the original error.
      try {
        this.disable();
      } catch {
        // Keep the original failure; disable()'s finally already reset the flags.
      }
      throw new MouseError(
        `Failed to enable mouse: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
    }
  };

  /**
   * Disables mouse event tracking.
   *
   * This method restores the input stream to its previous state and stops listening for data.
   */
  public disable = (): void => {
    if (!this.enabled) {
      return;
    }

    // Every step runs independently: one failing step (a broken stdout, a
    // throwing pause()) must not skip the rest of the terminal restore. The
    // first failure is reported once the cleanup has been attempted in full.
    let failure: unknown = null;
    const attempt = (step: () => void): void => {
      try {
        step();
      } catch (err) {
        failure ??= err;
      }
    };

    attempt(() => {
      this.outputStream.write(
        ANSI_CODES.mouseSGR.off + ANSI_CODES.mouseMotion.off + ANSI_CODES.mouseDrag.off + ANSI_CODES.mouseButton.off,
      );
    });
    attempt(() => this.inputStream.off('data', this.handleEvent));
    attempt(() => this.inputStream.pause());

    const previousRawMode = this.previousRawMode;
    if (previousRawMode !== null) {
      attempt(() => {
        this.setRawMode(previousRawMode);
        this.currentRawMode = previousRawMode;
      });
    }

    const previousEncoding = this.previousEncoding;
    if (previousEncoding !== null) {
      attempt(() => this.inputStream.setEncoding(previousEncoding));
    }

    // Unregister only after a fully successful cleanup: on a partial failure
    // the registry stays as the last-resort GC fallback.
    if (failure === null && this.cleanupToken) {
      ttyCleanupRegistry.unregister(this.cleanupToken);
      this.cleanupToken = null;
    }

    this.enabled = false;
    this.previousRawMode = null;
    this.previousEncoding = null;
    this.currentRawMode = null;

    if (failure !== null) {
      throw new MouseError(
        `Failed to disable mouse: ${failure instanceof Error ? failure.message : String(failure)}`,
        failure instanceof Error ? failure : undefined,
      );
    }
  };

  /**
   * Pauses mouse event emission without disabling terminal mouse mode.
   *
   * This method temporarily stops the emission of mouse events while keeping
   * the terminal mouse mode active.
   *
   * **Idempotent:** Calling this method when already paused has no effect.
   *
   * **No Terminal State Changes:** Unlike disable(), this method does not:
   * - Send ANSI escape codes to the terminal
   * - Modify the input stream's raw mode
   * - Change the input stream encoding
   * - Remove event listeners from the input stream
   */
  public pause = (): void => {
    if (this.paused) {
      return;
    }

    this.paused = true;
  };

  /**
   * Resumes mouse event emission without modifying terminal mouse mode.
   *
   * This method resumes the emission of mouse events after they were paused.
   *
   * **Idempotent:** Calling this method when not paused has no effect.
   */
  public resume = (): void => {
    if (!this.paused) {
      return;
    }

    this.paused = false;
  };

  /**
   * Checks if mouse event tracking is currently enabled.
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Checks if mouse event emission is currently paused.
   */
  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * Destroys the controller and cleans up all resources.
   *
   * **Idempotent:** Calling this method multiple times is safe and has no additional effect.
   */
  public destroy(): void {
    this.disable();
  }
}
