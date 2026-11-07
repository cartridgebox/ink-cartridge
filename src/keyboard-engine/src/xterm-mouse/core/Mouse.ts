import { EventEmitter } from "node:events";
import type {
	ListenerFor,
	MouseEvent,
	MouseEventAction,
	MouseOptions,
	MousePosition,
	MouseStreamEvent,
	ReadableStreamWithEncoding,
} from "../types/index.js";
import { EventStreamFactory } from "./EventStreamFactory.js";
import { MouseConvenienceMethods } from "./MouseConvenienceMethods.js";
import { MouseEventManager } from "./MouseEventManager.js";
import { TTYController } from "./TTYController.js";

/**
 * Represents and manages mouse events in a TTY environment.
 *
 * This class is a **facade** that composes smaller, focused components:
 * - **TTYController**: Manages terminal state and stream I/O
 * - **MouseEventManager**: Handles event emission and detection
 * - **EventStreamFactory**: Creates async generator streams
 * - **MouseConvenienceMethods**: Provides promise-based convenience methods
 *
 * **Automatic Cleanup:**
 * Mouse instances automatically register for cleanup when `enable()` is called.
 * If a Mouse instance is garbage collected without explicit cleanup via `disable()` or `destroy()`,
 * the TTYController ensures that stdin event listeners are removed to prevent memory leaks.
 *
 * **Recommended Cleanup:**
 * Despite automatic cleanup, it's still recommended to explicitly call `destroy()` when done
 * with a Mouse instance for immediate and predictable resource release.
 */
class Mouse {
	private readonly tty: TTYController;
	private readonly eventManager: MouseEventManager;
	private readonly streamFactory: EventStreamFactory;
	private readonly convenience: MouseConvenienceMethods;

	/**
	 * Result type for terminal capability checks.
	 */
	static readonly SupportCheckResult = {
		/** Mouse events are supported */
		Supported: "supported",
		/** Input stream is not a TTY */
		NotTTY: "not_tty",
		/** Output stream is not a TTY */
		OutputNotTTY: "output_not_tty",
	} as const;

	/**
	 * Constructs a new Mouse instance.
	 * @param options Optional configuration options for mouse behavior and dependencies.
	 * @param options.emitter The event emitter to use for emitting mouse events (defaults to a new EventEmitter).
	 * @param options.inputStream The readable stream to listen for mouse events on (defaults to process.stdin).
	 * @param options.outputStream The writable stream to send control sequences to (defaults to process.stdout).
	 * @param options.setRawMode Custom function to set raw mode (defaults to inputStream.setRawMode).
	 * @param options.clickDistanceThreshold Maximum allowed distance for click detection.
	 *
	 * @example
	 * ```ts
	 * // Default configuration
	 * const mouse = new Mouse();
	 *
	 * // Custom streams
	 * const mouse2 = new Mouse({
	 *   inputStream: customStdin,
	 *   outputStream: customStdout,
	 * });
	 *
	 * // Custom emitter
	 * const mouse3 = new Mouse({
	 *   emitter: myEventEmitter,
	 * });
	 *
	 * // Testing with mock setRawMode
	 * const mockSetRawMode = vi.fn();
	 * const mouse4 = new Mouse({ setRawMode: mockSetRawMode });
	 *
	 * // Custom click threshold
	 * const mouse5 = new Mouse({ clickDistanceThreshold: 0 });
	 *
	 * // All options combined
	 * const mouse6 = new Mouse({
	 *   emitter: myEventEmitter,
	 *   inputStream: customStdin,
	 *   outputStream: customStdout,
	 *   setRawMode: mockSetRawMode,
	 *   clickDistanceThreshold: 5,
	 * });
	 * ```
	 */
	constructor(options?: MouseOptions) {
		const inputStream = options?.inputStream ?? process.stdin;
		const outputStream = options?.outputStream ?? process.stdout;
		const eventEmitter = options?.emitter ?? new EventEmitter();

		// Create event manager first (needed by TTYController for handleEvent)
		const eventManager = new MouseEventManager(eventEmitter, options);
		this.eventManager = eventManager;

		// The data listener is retained by the input stream and the GC cleanup
		// registry, so it must not close over this Mouse or its TTYController:
		// either reference would keep the controller reachable forever and the
		// registry callback would never run. `pausedState` is shared with the
		// controller instead of reading `this.tty.isPaused()` from the listener.
		const pausedState = { current: false };
		this.tty = new TTYController(
			inputStream,
			outputStream,
			(data: Buffer) => eventManager.handleEvent(data, pausedState.current),
			options?.setRawMode,
			pausedState,
		);

		this.streamFactory = new EventStreamFactory(this.eventManager.getEmitter());
		// Must not capture `this`: closures in this constructor share one context,
		// so a `this` capture here would keep the Mouse reachable from the TTY
		// data listener and the GC cleanup registry, defeating the safety net.
		this.convenience = new MouseConvenienceMethods(
			this.eventManager.getEmitter(),
			() => eventManager.getLastPosition(),
		);
	}

	/**
	 * Checks if the current terminal environment supports mouse events.
	 *
	 * This is a convenience method that wraps {@link checkSupport} and returns
	 * a simple boolean. It checks if the provided streams (or `process.stdin`/
	 * `process.stdout` by default) are TTYs.
	 *
	 * **Use Cases:**
	 * - Before creating a Mouse instance in environments that may not support TTY
	 * - To provide better error messages in CLI tools
	 * - To conditionally enable mouse features in applications
	 * - Checking custom streams before passing to Mouse constructor
	 *
	 * **Note:** For detailed error information (e.g., to distinguish between
	 * input and output stream issues), use {@link checkSupport} instead.
	 *
	 * @param inputStream Optional input stream to check (defaults to process.stdin)
	 * @param outputStream Optional output stream to check (defaults to process.stdout)
	 * @returns true if the terminal likely supports mouse events
	 *
	 * @example
	 * ```ts
	 * import { Mouse } from 'xterm-mouse';
	 *
	 * // Check default streams
	 * if (Mouse.isSupported()) {
	 *   const mouse = new Mouse();
	 *   mouse.enable();
	 * } else {
	 *   console.log('Mouse events not supported in this environment');
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Check custom streams
	 * const customStdin = getCustomStdin();
	 * const customStdout = getCustomStdout();
	 *
	 * if (Mouse.isSupported(customStdin, customStdout)) {
	 *   const mouse = new Mouse({
	 *     inputStream: customStdin,
	 *     outputStream: customStdout,
	 *   });
	 *   mouse.enable();
	 * }
	 * ```
	 */
	static isSupported(
		inputStream?: ReadableStreamWithEncoding,
		outputStream?: NodeJS.WriteStream,
	): boolean {
		const result = Mouse.checkSupport({ inputStream, outputStream });
		return result === Mouse.SupportCheckResult.Supported;
	}

	/**
	 * Performs a detailed check of terminal mouse event support.
	 *
	 * This method provides more information than `isSupported()` by checking
	 * specific streams and returning the reason if support is not available.
	 *
	 * **Use Cases:**
	 * - Need detailed information about why mouse events aren't supported
	 * - Checking custom streams
	 * - Providing user-friendly error messages
	 *
	 * @param options Optional configuration with custom streams to check
	 * @param options.inputStream The input stream to check (defaults to process.stdin)
	 * @param options.outputStream The output stream to check (defaults to process.stdout)
	 * @returns A result from SupportCheckResult indicating support status
	 *
	 * @example
	 * ```ts
	 * import { Mouse } from 'xterm-mouse';
	 *
	 * const result = Mouse.checkSupport();
	 * if (result === Mouse.SupportCheckResult.Supported) {
	 *   console.log('Mouse events are supported!');
	 * } else if (result === Mouse.SupportCheckResult.NotTTY) {
	 *   console.error('Not running in a terminal');
	 * } else if (result === Mouse.SupportCheckResult.OutputNotTTY) {
	 *   console.error('Output is not a terminal');
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Check custom streams
	 * const result = Mouse.checkSupport({
	 *   inputStream: myCustomStdin,
	 *   outputStream: myCustomStdout,
	 * });
	 * ```
	 */
	static checkSupport(
		options?: Pick<MouseOptions, "inputStream" | "outputStream">,
	): string {
		const inputStream = options?.inputStream ?? process.stdin;
		const outputStream = options?.outputStream ?? process.stdout;

		if (!inputStream.isTTY) {
			return Mouse.SupportCheckResult.NotTTY;
		}
		if (!outputStream.isTTY) {
			return Mouse.SupportCheckResult.OutputNotTTY;
		}
		return Mouse.SupportCheckResult.Supported;
	}

	/**
	 * Enables mouse event tracking.
	 *
	 * This method activates mouse event capture by putting the input stream into raw mode
	 * and sending the appropriate ANSI escape sequences to enable mouse tracking in the terminal.
	 *
	 * **TTY Requirement:** This method requires the input stream to be a TTY (terminal).
	 * Mouse events cannot be captured when the input is piped, redirected, or running in a
	 * non-interactive environment. Check `process.stdin.isTTY` before calling this method.
	 *
	 * **Error Handling:** This method throws a `MouseError` if:
	 * - The input stream is not a TTY (interactive terminal)
	 * - The stream cannot be put into raw mode
	 * - The terminal does not support the mouse tracking ANSI codes
	 *
	 * **Automatic Cleanup:**
	 * When `enable()` is called, the Mouse instance registers with a FinalizationRegistry.
	 * If the instance is garbage collected without explicit cleanup via `disable()` or `destroy()`,
	 * the registry will automatically remove the stdin listener and restore stream state to prevent
	 * memory leaks. This is a safety net - explicit cleanup via `destroy()` is still recommended
	 * for immediate and predictable resource release.
	 *
	 * **Side Effects:**
	 * - The input stream is switched to raw mode (character-by-character input)
	 * - The input encoding is set to UTF-8
	 * - The input stream is resumed if paused
	 * - ANSI escape codes are written to the output stream to enable mouse tracking
	 * - The original stream settings are preserved for restoration on `disable()`
	 * - The Mouse instance is registered with the FinalizationRegistry for automatic cleanup
	 *
	 * @throws {Error} If the input stream is not a TTY
	 * @throws {MouseError} If enabling mouse tracking fails
	 * @see {@link disable} to disable tracking and restore the stream
	 * @see {@link destroy} for recommended cleanup method
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 *
	 * if (process.stdin.isTTY) {
	 *   mouse.enable();
	 *   mouse.on('press', (event) => {
	 *     console.log(`Pressed at ${event.x}, ${event.y}`);
	 *   });
	 * } else {
	 *   console.error('Mouse tracking requires a TTY');
	 * }
	 * ```
	 */
	public enable = (): void => {
		this.tty.enable();
	};

	/**
	 * Disables mouse event tracking.
	 * This method restores the input stream to its previous state and stops listening for data.
	 * @see {@link enable} to enable tracking and capture mouse events
	 */
	public disable = (): void => {
		this.eventManager.clearPending();
		this.tty.disable();
	};

	/**
	 * Pauses mouse event emission without disabling terminal mouse mode.
	 *
	 * This method temporarily stops the emission of mouse events while keeping
	 * the terminal mouse mode active. This is useful when you want to temporarily
	 * ignore mouse events without the overhead of disabling and re-enabling mouse tracking.
	 *
	 * **Idempotent:** Calling this method when already paused has no effect.
	 *
	 * **No Terminal State Changes:** Unlike {@link disable}, this method does not:
	 * - Send ANSI escape codes to the terminal
	 * - Modify the input stream's raw mode
	 * - Change the input stream encoding
	 * - Remove event listeners from the input stream
	 *
	 * **Difference from disable():**
	 * - pause(): Stops event emission only, terminal mouse mode remains active
	 * - disable(): Stops event emission AND deactivates terminal mouse mode
	 *
	 * @see {@link resume} to resume event emission
	 * @see {@link disable} to completely disable mouse tracking
	 * @see {@link isPaused} to check if currently paused
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Temporarily ignore mouse events during an operation
	 * mouse.pause();
	 * // ... perform operations that should not trigger mouse events
	 * mouse.resume();
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Comparing pause() vs disable()
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Using pause(): Fast, no terminal overhead
	 * mouse.pause();
	 * performQuickOperation();
	 * mouse.resume(); // Terminal mouse mode was never disabled
	 *
	 * // VS using disable(): Slower, terminal overhead
	 * mouse.disable();
	 * performQuickOperation();
	 * mouse.enable(); // Had to re-enable terminal mouse mode
	 * ```
	 */
	public pause = (): void => {
		this.eventManager.clearPending();
		this.tty.pause();
	};

	/**
	 * Resumes mouse event emission without modifying terminal mouse mode.
	 *
	 * This method resumes the emission of mouse events after they were paused
	 * using {@link pause}. The terminal mouse mode remains active throughout.
	 *
	 * **Idempotent:** Calling this method when not paused has no effect.
	 *
	 * **No Terminal State Changes:** Unlike {@link enable}, this method does not:
	 * - Send ANSI escape codes to the terminal
	 * - Modify the input stream's raw mode
	 * - Change the input stream encoding
	 * - Add event listeners to the input stream
	 *
	 * **Difference from enable():**
	 * - resume(): Resumes event emission only, assumes terminal mouse mode is already active
	 * - enable(): Activates terminal mouse mode AND resumes event emission
	 *
	 * @see {@link pause} to pause event emission
	 * @see {@link enable} to completely enable mouse tracking
	 * @see {@link isPaused} to check if currently paused
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Temporarily ignore mouse events during an operation
	 * mouse.pause();
	 * // ... perform operations that should not trigger mouse events
	 * mouse.resume(); // Events will now be emitted again
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Comparing resume() vs enable()
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Pause and resume: Fast state change
	 * mouse.pause();
	 * performOperation();
	 * mouse.resume(); // No terminal overhead
	 *
	 * // VS disable and enable: Slower, re-enables terminal
	 * mouse.disable();
	 * performOperation();
	 * mouse.enable(); // Re-enables terminal mouse mode (ANSI codes, raw mode)
	 * ```
	 */
	public resume = (): void => {
		this.eventManager.clearPending();
		this.tty.resume();
	};

	/**
	 * Registers a listener for a specific mouse event.
	 *
	 * **Type Inference:**
	 * This method uses TypeScript's type inference to provide accurate types for the event parameter
	 * based on the event name. For example:
	 * - For 'wheel' events, `event.button` is typed as `'wheel-up' | 'wheel-down' | 'wheel-left' | 'wheel-right'`
	 * - For 'move' events, `event.button` is typed as `'none'`
	 * - For 'drag' events, `event.button` excludes wheel buttons
	 *
	 * @param event The name of the event to listen for.
	 * @param listener The callback function to execute when the event is triggered.
	 * @returns The event emitter instance.
	 * @see {@link off} to remove the listener
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // TypeScript knows event.button is a wheel button type here
	 * mouse.on('wheel', (event) => {
	 *   console.log(event.button); // 'wheel-up' | 'wheel-down' | 'wheel-left' | 'wheel-right'
	 * });
	 *
	 * // TypeScript knows event.button is 'none' here
	 * mouse.on('move', (event) => {
	 *   console.log(event.button); // 'none'
	 * });
	 * ```
	 */
	public on = <T extends MouseEventAction | "error">(
		event: T,
		listener: T extends "error" ? (error: Error) => void : ListenerFor<T>,
	): EventEmitter => {
		return this.eventManager.on(event, listener);
	};

	/**
	 * Removes a listener for a specific mouse event.
	 *
	 * **Type Inference:**
	 * This method uses the same type inference as `on()` to ensure type safety when removing listeners.
	 *
	 * @param event The name of the event to stop listening for.
	 * @param listener The callback function to remove.
	 * @returns The event emitter instance.
	 * @see {@link on} to add a listener
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * const handler = (event: EventByAction<'press'>) => {
	 *   console.log(`Pressed at ${event.x}, ${event.y}`);
	 * };
	 *
	 * mouse.on('press', handler);
	 * mouse.off('press', handler);
	 * ```
	 */
	public off = <T extends MouseEventAction | "error">(
		event: T,
		listener: T extends "error" ? (error: Error) => void : ListenerFor<T>,
	): EventEmitter => {
		return this.eventManager.off(event, listener);
	};

	/**
	 * Registers a one-time listener that automatically removes itself after the first event.
	 *
	 * **Type Inference:**
	 * This method uses the same type inference as `on()` to provide accurate types for the event parameter.
	 *
	 * **Automatic Cleanup:**
	 * The listener is automatically removed after the first invocation, preventing memory leaks
	 * and eliminating the need for manual cleanup code.
	 *
	 * @param event The name of the event to listen for.
	 * @param listener The callback function to execute once when the event is triggered.
	 * @returns The event emitter instance.
	 * @see {@link on} for persistent listeners
	 * @see {@link off} to manually remove listeners
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Listen for a single click
	 * mouse.once('click', (event) => {
	 *   console.log('Got one click!', event);
	 *   // Listener is automatically removed after this execution
	 * });
	 *
	 * // Wait for first wheel event
	 * mouse.once('wheel', (event) => {
	 *   // TypeScript knows event.button is a wheel button type
	 *   console.log(`Scrolled: ${event.button}`);
	 * });
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Simplified one-time event handling
	 * // Before (manual cleanup required):
	 * const handler = (event) => {
	 *   console.log('Got click', event);
	 *   mouse.off('click', handler);
	 *   // continue logic...
	 * };
	 * mouse.on('click', handler);
	 *
	 * // After (automatic cleanup):
	 * mouse.once('click', (event) => {
	 *   console.log('Got click', event);
	 *   // continue logic... listener already removed
	 * });
	 * ```
	 */
	public once = <T extends MouseEventAction | "error">(
		event: T,
		listener: T extends "error" ? (error: Error) => void : ListenerFor<T>,
	): EventEmitter => {
		return this.eventManager.once(event, listener);
	};

	/**
	 * Returns an async generator that yields mouse events of a specific type.
	 *
	 * This method provides a convenient way to iterate over mouse events using async/await syntax.
	 * The async generator will yield events as they occur, allowing for clean and readable event handling code.
	 *
	 * **Cancellation with AbortSignal:** The async generator supports cancellation through the `signal` option.
	 * When the provided AbortSignal is aborted, the generator will throw a `MouseError` and clean up all listeners.
	 * This is particularly useful for implementing timeout functionality or user-initiated cancellation.
	 *
	 * **Queue Management:**
	 * - By default, events are queued up to `maxQueue` (default: 100, max: 1000)
	 * - When `latestOnly` is true, only the most recent event is buffered, dropping intermediate events
	 * - This is useful for high-frequency events like 'move' where you only care about the latest position
	 *
	 * **Error Handling:** Errors from the mouse event stream will be thrown from the generator,
	 * allowing for try/catch error handling in the iteration loop.
	 *
	 * **Cleanup:** The generator automatically cleans up event listeners when:
	 * - The iteration loop completes (breaks or returns)
	 * - An error is thrown
	 * - The abort signal is triggered
	 *
	 * @param type The type of mouse event to listen for (e.g., 'press', 'drag', 'wheel').
	 * @param options Configuration for the event stream.
	 * @param options.latestOnly If true, only the latest event is buffered. Defaults to false.
	 * @param options.maxQueue The maximum number of events to queue. Defaults to 100, with a maximum of 1000.
	 * @param options.signal An AbortSignal to cancel the async generator and clean up resources.
	 * @yields {MouseEvent} A mouse event object containing x, y, button, and action properties.
	 * @throws {MouseError} When the abort signal is triggered or a mouse event stream error occurs.
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Collect 5 mouse clicks
	 * const clicks: MouseEvent[] = [];
	 * for await (const event of mouse.eventsOf('click')) {
	 *   clicks.push(event);
	 *   console.log(`Click at ${event.x}, ${event.y}`);
	 *   if (clicks.length >= 5) break;
	 * }
	 * mouse.disable();
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Track mouse movement with cancellation after 5 seconds
	 * const controller = new AbortController();
	 * setTimeout(() => controller.abort(), 5000);
	 *
	 * try {
	 *   for await (const event of mouse.eventsOf('move', { signal: controller.signal })) {
	 *     console.log(`Mouse moved to ${event.x}, ${event.y}`);
	 *   }
	 * } catch (err) {
	 *   if (err instanceof MouseError && err.message.includes('aborted')) {
	 *     console.log('Tracking stopped after timeout');
	 *   } else {
	 *     throw err;
	 *   }
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Track only the latest mouse position (for high-frequency events)
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Display cursor position updates
	 * for await (const event of mouse.eventsOf('move', { latestOnly: true })) {
	 *   // Clear line and show position
	 *   process.stdout.write(`\r\x1b[KPosition: ${event.x}, ${event.y}`);
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Implement drag detection with user cancellation
	 * const controller = new AbortController();
	 *
	 * // Listen for Ctrl+C to cancel
	 * process.stdin.setRawMode(true);
	 * process.stdin.on('data', (key) => {
	 *   if (key[0] === 3) { // Ctrl+C
	 *     controller.abort();
	 *   }
	 * });
	 *
	 * try {
	 *   for await (const event of mouse.eventsOf('drag', { signal: controller.signal })) {
	 *     console.log(`Dragging at ${event.x}, ${event.y} with button ${event.button}`);
	 *   }
	 * } catch (err) {
	 *   if (err instanceof MouseError && err.message.includes('aborted')) {
	 *     console.log('\nDrag tracking cancelled by user');
	 *   }
	 * } finally {
	 *   mouse.disable();
	 * }
	 * ```
	 */
	public async *eventsOf(
		type: MouseEventAction,
		options?: { latestOnly?: boolean; maxQueue?: number; signal?: AbortSignal },
	): AsyncGenerator<MouseEvent> {
		yield* this.streamFactory.eventsOf(type, options);
	}

	/**
	 * Returns an async generator that yields move events at most once per specified interval.
	 *
	 * This method provides debounced move events, reducing event frequency for smooth animations
	 * and performance optimization. Unlike `eventsOf('move')` which yields every move event,
	 * this method waits for a quiet period before emitting, ensuring you only get events at
	 * a controlled rate.
	 *
	 * **Debouncing Behavior:**
	 * - Move events are collected during the debounce interval
	 * - Only the most recent event is yielded after the interval elapses
	 * - If the mouse continues moving, the timer restarts with each new event
	 * - This is ideal for UI updates, animations, and position tracking where you want
	 *   to avoid excessive redraws
	 *
	 * **Cancellation with AbortSignal:** The async generator supports cancellation through
	 * the `signal` option. When the provided AbortSignal is aborted, the generator will stop
	 * immediately and clean up all listeners.
	 *
	 * **Cleanup:** The generator automatically cleans up event listeners and timers when:
	 * - The iteration loop completes (breaks or returns)
	 * - An error is thrown
	 * - The abort signal is triggered
	 *
	 * @param options Configuration for the debounced event stream.
	 * @param options.interval Minimum time in milliseconds between yielded events. Defaults to 16 (~60fps).
	 * @param options.signal An AbortSignal to cancel the async generator and clean up resources.
	 * @yields {MouseEvent} A mouse move event object containing x, y, button, and action properties.
	 * @throws {MouseError} When the abort signal is triggered or a mouse event stream error occurs.
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Track mouse position at ~60fps for smooth cursor following
	 * for await (const event of mouse.debouncedMoveEvents()) {
	 *   console.log(`Mouse at ${event.x}, ${event.y}`);
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Slower update rate (30fps) for less frequent UI updates
	 * for await (const event of mouse.debouncedMoveEvents({ interval: 33 })) {
	 *   updateCursorPosition(event.x, event.y);
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Debounced move events with cancellation
	 * const controller = new AbortController();
	 * setTimeout(() => controller.abort(), 10000); // Stop after 10 seconds
	 *
	 * try {
	 *   for await (const event of mouse.debouncedMoveEvents({ signal: controller.signal })) {
	 *     // Smooth animation update at 60fps
	 *     renderFrame(event.x, event.y);
	 *   }
	 * } catch (err) {
	 *   if (err instanceof MouseError && err.message.includes('aborted')) {
	 *     console.log('Animation stopped');
	 *   }
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Comparing debounced vs raw move events
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Raw: Can fire hundreds of times per second
	 * for await (const event of mouse.eventsOf('move')) {
	 *   console.log('Raw move'); // May print too fast to read
	 *   if (event.x > 50) break;
	 * }
	 *
	 * // Debounced: Controlled rate, easier to process
	 * for await (const event of mouse.debouncedMoveEvents({ interval: 100 })) {
	 *   console.log('Debounced move'); // Prints at most 10 times per second
	 *   if (event.x > 50) break;
	 * }
	 * ```
	 */
	public async *debouncedMoveEvents(options?: {
		interval?: number;
		signal?: AbortSignal;
	}): AsyncGenerator<MouseEvent> {
		yield* this.streamFactory.debouncedMoveEvents(options);
	}

	/**
	 * Returns an async generator that yields all mouse events.
	 * Each yielded value is an object containing the event type and the event data.
	 * @param options Configuration for the event stream.
	 * @param options.latestOnly If true, only the latest event is buffered. Defaults to false.
	 * @param options.maxQueue The maximum number of events to queue. Defaults to 1000.
	 * @param options.signal An AbortSignal to cancel the async generator.
	 * @yields {MouseStreamEvent} An object with the event type and data.
	 */
	public async *stream(options?: {
		latestOnly?: boolean;
		maxQueue?: number;
		signal?: AbortSignal;
	}): AsyncGenerator<MouseStreamEvent> {
		yield* this.streamFactory.stream(options);
	}

	/**
	 * Checks if mouse event tracking is currently enabled.
	 * @returns {boolean} True if enabled, false otherwise.
	 */
	public isEnabled(): boolean {
		return this.tty.isEnabled();
	}

	/**
	 * Checks if mouse event emission is currently paused.
	 *
	 * This method returns the current pause state of mouse event emission.
	 * When paused, no mouse events will be emitted, but terminal mouse mode
	 * remains active.
	 *
	 * **Independent from enabled state:** The paused state is independent from
	 * the enabled state. You can have:
	 * - enabled=true, paused=false: Normal operation, events are emitted
	 * - enabled=true, paused=true: Terminal mouse mode active, but no events emitted
	 * - enabled=false, paused=false: Terminal mouse mode inactive, no events emitted
	 * - enabled=false, paused=true: Terminal mouse mode inactive, pause state preserved
	 *
	 * **Difference from isEnabled():**
	 * - isPaused(): Checks if event emission is paused (state flag only)
	 * - isEnabled(): Checks if terminal mouse mode is active (includes terminal state)
	 *
	 * @returns {boolean} True if event emission is paused, false otherwise.
	 * @see {@link pause} to pause event emission
	 * @see {@link resume} to resume event emission
	 * @see {@link isEnabled} to check if terminal mouse mode is enabled
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * console.log(mouse.isPaused()); // false
	 *
	 * mouse.pause();
	 * console.log(mouse.isPaused()); // true
	 *
	 * mouse.resume();
	 * console.log(mouse.isPaused()); // false
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Comparing isPaused() vs isEnabled()
	 * const mouse = new Mouse();
	 *
	 * mouse.enable();
	 * console.log(mouse.isEnabled()); // true (terminal mouse mode active)
	 * console.log(mouse.isPaused());  // false (events are being emitted)
	 *
	 * mouse.pause();
	 * console.log(mouse.isEnabled()); // true (terminal mouse mode still active!)
	 * console.log(mouse.isPaused());  // true (events are paused)
	 *
	 * mouse.disable();
	 * console.log(mouse.isEnabled()); // false (terminal mouse mode inactive)
	 * console.log(mouse.isPaused());  // true (pause state is preserved)
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Practical use: Check state before performing operations
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * function performSensitiveOperation() {
	 *   // Save current state
	 *   const wasPaused = mouse.isPaused();
	 *
	 *   // Ensure we're paused during the operation
	 *   mouse.pause();
	 *
	 *   // ... perform operation ...
	 *
	 *   // Restore previous state
	 *   if (!wasPaused) {
	 *     mouse.resume();
	 *   }
	 * }
	 * ```
	 */
	public isPaused(): boolean {
		return this.tty.isPaused();
	}

	/**
	 * Disables mouse tracking and removes all event listeners.
	 *
	 * **Recommended for Immediate Cleanup:**
	 * This method is the recommended way to clean up a Mouse instance when you're done with it.
	 * While automatic cleanup via FinalizationRegistry prevents memory leaks on garbage collection,
	 * calling `destroy()` explicitly ensures immediate and predictable resource release with
	 * no dependency on GC timing.
	 *
	 * **Idempotent:** Calling this method multiple times is safe and has no additional effect.
	 *
	 * **Side Effects:**
	 * - Calls `disable()` to stop mouse tracking and restore stream state
	 * - Unregisters from the FinalizationRegistry to prevent duplicate cleanup
	 * - Removes all event listeners from the internal event emitter
	 * - Sets the Mouse instance to a non-functional state
	 *
	 * @see {@link disable} to disable mouse tracking without removing event listeners
	 * @see {@link enable} to enable mouse tracking
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // ... use mouse instance ...
	 *
	 * // Always destroy when done for immediate cleanup
	 * mouse.destroy();
	 * ```
	 */
	public destroy(): void {
		this.eventManager.clearPending();
		this.tty.destroy();
		this.eventManager.removeAllListeners();
	}

	/**
	 * Waits for a single click event and returns it.
	 *
	 * This is a convenience method that wraps the streaming API into a simple promise-based helper.
	 * It's useful for common interaction patterns like "wait for user to click anywhere".
	 *
	 * **Timeout:** The method will reject with a `MouseError` if the timeout is exceeded.
	 *
	 * **Cancellation:** The method can be cancelled early using an AbortSignal.
	 *
	 * @param options Configuration options for the wait operation.
	 * @param options.timeout Maximum time to wait in milliseconds. Defaults to 30000 (30 seconds).
	 * @param options.signal An AbortSignal to cancel the operation early.
	 * @returns A promise that resolves with the click event.
	 * @throws {MouseError} If timeout is exceeded or operation is aborted.
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * try {
	 *   const click = await mouse.waitForClick();
	 *   console.log(`Clicked at ${click.x}, ${click.y} with ${click.button}`);
	 * } catch (err) {
	 *   if (err instanceof MouseError) {
	 *     console.error('Timeout or error:', err.message);
	 *   }
	 * } finally {
	 *   mouse.disable();
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Wait with custom timeout
	 * const click = await mouse.waitForClick({ timeout: 5000 });
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Cancel with AbortController
	 * const controller = new AbortController();
	 * setTimeout(() => controller.abort(), 1000);
	 *
	 * try {
	 *   const click = await mouse.waitForClick({ signal: controller.signal });
	 * } catch (err) {
	 *   if (err instanceof MouseError && err.message.includes('aborted')) {
	 *     console.log('Wait cancelled');
	 *   }
	 * }
	 * ```
	 */
	public async waitForClick(options?: {
		timeout?: number;
		signal?: AbortSignal;
	}): Promise<MouseEvent> {
		return this.convenience.waitForClick(options);
	}

	/**
	 * Waits for any mouse input event and returns it.
	 *
	 * This is a convenience method that waits for any mouse event (press, release, click,
	 * drag, wheel, or move). Useful for "wait for any user interaction" patterns.
	 *
	 * **Timeout:** The method will reject with a `MouseError` if the timeout is exceeded.
	 *
	 * **Cancellation:** The method can be cancelled early using an AbortSignal.
	 *
	 * @param options Configuration options for the wait operation.
	 * @param options.timeout Maximum time to wait in milliseconds. Defaults to 30000 (30 seconds).
	 * @param options.signal An AbortSignal to cancel the operation early.
	 * @returns A promise that resolves with the first mouse event received.
	 * @throws {MouseError} If timeout is exceeded or operation is aborted.
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * try {
	 *   const event = await mouse.waitForInput();
	 *   console.log(`Got ${event.action} at ${event.x}, ${event.y}`);
	 * } catch (err) {
	 *   if (err instanceof MouseError) {
	 *     console.error('Timeout or error:', err.message);
	 *   }
	 * } finally {
	 *   mouse.disable();
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Wait with custom timeout
	 * const event = await mouse.waitForInput({ timeout: 5000 });
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Use for "press any key to continue" style interaction
	 * console.log('Move mouse or click to continue...');
	 * await mouse.waitForInput();
	 * console.log('Continuing...');
	 * ```
	 */
	public async waitForInput(options?: {
		timeout?: number;
		signal?: AbortSignal;
	}): Promise<MouseEvent> {
		return this.convenience.waitForInput(options);
	}

	/**
	 * Gets the last known mouse position synchronously.
	 *
	 * This method immediately returns the last cached mouse position from move or drag events,
	 * without waiting for new events. Returns null if no mouse movement has occurred yet.
	 *
	 * **No Waiting:** Unlike `getMousePosition()`, this method never waits - it returns
	 * the cached position immediately or null if unavailable.
	 *
	 * **Use Cases:**
	 * - When you need immediate position access without awaiting
	 * - To check if mouse has moved yet (null check)
	 * - For non-async contexts where you can't use await
	 *
	 * @returns The last known position as { x, y }, or null if no movement yet.
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * // Returns null if mouse hasn't moved yet
	 * const pos = mouse.getLastPosition();
	 * if (pos) {
	 *   console.log(`Mouse at ${pos.x}, ${pos.y}`);
	 * } else {
	 *   console.log('No movement yet');
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Use in synchronous context
	 * mouse.on('move', () => {
	 *   const pos = mouse.getLastPosition();
	 *   console.log(`Current: ${pos?.x}, ${pos?.y}`);
	 * });
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Combine with async version for fallback
	 * let pos = mouse.getLastPosition();
	 * if (!pos) {
	 *   pos = await mouse.getMousePosition();
	 * }
	 * ```
	 */
	public getLastPosition(): MousePosition | null {
		return this.eventManager.getLastPosition();
	}

	/**
	 * Gets the current mouse position, returning immediately if available.
	 *
	 * This method returns the last known mouse position from move or drag events.
	 * If the mouse has moved since tracking was enabled, the position is returned
	 * immediately without waiting. Otherwise, it waits for the next move event.
	 *
	 * **Cached Position:** The method maintains an internal cache of the last position
	 * from move or drag events. This allows for instant position retrieval without
	 * waiting for new events.
	 *
	 * **Timeout:** The method will reject with a `MouseError` if the timeout is exceeded
	 * while waiting for the first move event.
	 *
	 * **Cancellation:** The method can be cancelled early using an AbortSignal.
	 *
	 * @param options Configuration options for the wait operation.
	 * @param options.timeout Maximum time to wait in milliseconds. Defaults to 30000 (30 seconds).
	 * @param options.signal An AbortSignal to cancel the operation early.
	 * @returns A promise that resolves with the x, y coordinates.
	 * @throws {MouseError} If timeout is exceeded or operation is aborted.
	 *
	 * @example
	 * ```ts
	 * const mouse = new Mouse();
	 * mouse.enable();
	 *
	 * try {
	 *   // If mouse has moved, returns immediately
	 *   // Otherwise waits for first move event
	 *   const { x, y } = await mouse.getMousePosition();
	 *   console.log(`Mouse is at ${x}, ${y}`);
	 * } finally {
	 *   mouse.disable();
	 * }
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Get position without waiting (after mouse has moved)
	 * mouse.on('move', () => {
	 *   // This will resolve immediately since we have a cached position
	 *   mouse.getMousePosition().then(({ x, y }) => {
	 *     console.log(`Current position: ${x}, ${y}`);
	 *   });
	 * });
	 * ```
	 *
	 * @example
	 * ```ts
	 * // Use with custom timeout
	 * const { x, y } = await mouse.getMousePosition({ timeout: 5000 });
	 * ```
	 */
	public async getMousePosition(options?: {
		timeout?: number;
		signal?: AbortSignal;
	}): Promise<MousePosition> {
		return this.convenience.getMousePosition(options);
	}
}

export { Mouse };
