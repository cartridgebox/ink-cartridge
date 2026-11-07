import type { EventEmitter } from "node:events";
import { parseMouseEventChunk } from "../parser/ansiParser.js";
import type {
	ListenerFor,
	MouseEvent,
	MouseEventAction,
	MouseOptions,
} from "../types/index.js";
import { ClickDetector } from "./ClickDetector.js";
import { PositionTracker } from "./PositionTracker.js";

/**
 * MouseEventManager handles event emission and detection.
 *
 * Responsibilities:
 * - Parse raw ANSI data into mouse events
 * - Emit events through EventEmitter
 * - Detect clicks from press+release events
 * - Track mouse position
 * - Provide type-safe event listener management (on/off/once)
 */
export class MouseEventManager {
	private readonly clickDetector: ClickDetector;
	private readonly positionTracker: PositionTracker;
	// A report can be split across reads; keep the valid prefix until the rest
	// arrives (or until pause/disable/reset discards it).
	private pending = "";

	/**
	 * Creates an event manager that parses raw ANSI data and emits mouse events.
	 * @param emitter The event emitter to emit mouse events through.
	 * @param options Configuration options forwarded to the click detector.
	 */
	constructor(
		private emitter: EventEmitter,
		options?: MouseOptions,
	) {
		this.clickDetector = new ClickDetector(options);
		this.positionTracker = new PositionTracker();
	}

	/**
	 * Processes raw ANSI data and emits mouse events.
	 *
	 * This method:
	 * - Parses ANSI escape sequences into mouse events
	 * - Emits events through the EventEmitter
	 * - Detects clicks and emits click events
	 * - Tracks mouse position
	 *
	 * @param data Raw ANSI data from stdin
	 * @param paused Whether event emission is currently paused
	 */
	public handleEvent = (data: Buffer, paused: boolean): void => {
		if (paused) {
			this.pending = "";
			return;
		}

		try {
			const { events, remainder } = parseMouseEventChunk(
				this.pending + data.toString(),
			);
			this.pending = remainder;

			for (const event of events) {
				this.positionTracker.processEvent(event);

				this.emitter.emit(event.action, event);

				this.clickDetector.processEvent(event, (clickEvent: MouseEvent) => {
					this.emitter.emit("click", clickEvent);
				});
			}
		} catch (err) {
			this.emitter.emit("error", err);
		}
	};

	/**
	 * Registers a listener for a specific mouse event.
	 *
	 * @param event The name of the event to listen for
	 * @param listener The callback function to execute when the event is triggered
	 * @returns The event emitter instance
	 */
	public on = <T extends MouseEventAction | "error">(
		event: T,
		listener: T extends "error" ? (error: Error) => void : ListenerFor<T>,
	): EventEmitter => {
		return this.emitter.on(
			event,
			listener as Parameters<typeof this.emitter.on>[1],
		);
	};

	/**
	 * Removes a listener for a specific mouse event.
	 *
	 * @param event The name of the event to stop listening for
	 * @param listener The callback function to remove
	 * @returns The event emitter instance
	 */
	public off = <T extends MouseEventAction | "error">(
		event: T,
		listener: T extends "error" ? (error: Error) => void : ListenerFor<T>,
	): EventEmitter => {
		return this.emitter.off(
			event,
			listener as Parameters<typeof this.emitter.off>[1],
		);
	};

	/**
	 * Registers a one-time listener that automatically removes itself after the first event.
	 *
	 * @param event The name of the event to listen for
	 * @param listener The callback function to execute once when the event is triggered
	 * @returns The event emitter instance
	 */
	public once = <T extends MouseEventAction | "error">(
		event: T,
		listener: T extends "error" ? (error: Error) => void : ListenerFor<T>,
	): EventEmitter => {
		const wrappedListener = (...args: unknown[]): void => {
			this.emitter.off(event, wrappedListener);
			(listener as (...args: unknown[]) => void)(...args);
		};
		return this.emitter.on(
			event,
			wrappedListener as Parameters<typeof this.emitter.on>[1],
		);
	};

	/**
	 * Gets the underlying EventEmitter instance.
	 */
	public getEmitter(): EventEmitter {
		return this.emitter;
	}

	/**
	 * Gets the last known mouse position.
	 */
	public getLastPosition(): { x: number; y: number } | null {
		return this.positionTracker.getLastPosition();
	}

	/**
	 * Removes all event listeners from the emitter.
	 */
	public removeAllListeners(): void {
		this.emitter.removeAllListeners();
	}

	/**
	 * Resets the internal state (click detector, position tracker, and a
	 * partially received report).
	 */
	public reset(): void {
		this.clickDetector.reset();
		this.positionTracker.reset();
		this.pending = "";
	}

	/** Drops a partially received report (used when input is paused/disabled). */
	public clearPending = (): void => {
		this.pending = "";
	};
}
